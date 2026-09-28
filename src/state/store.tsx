/**
 * Store global Zenith — Context + useReducer + persistensi AsyncStorage.
 * Layar browser SELALU ter-mount; layar lain dirender sebagai overlay
 * supaya WebView (tab) tidak kehilangan keadaannya.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { AppState as RNAppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Bookmark,
  BrowserProfile,
  Extension,
  TabGroup,
  HistoryItem,
  OmniboxState,
  ProfileFocus,
  Screen,
  Settings,
  SiteConfig,
  Tab,
  UiState,
  UserScript,
  Workspace,
} from '../types';
import {
  DEFAULT_ENGINES,
  DEFAULT_PROFILE,
  DEFAULT_PROFILE_ID,
  DEFAULT_SETTINGS,
  DEFAULT_WORKSPACES,
  uid,
  workspacesForProfile,
} from './defaults';
import { flushCookies, readStateBackup, restorePrimaryCookies, setActiveBrowserProfile, writeStateBackup } from '../core/native';
import { adblockAllowHost, adblockInit, adblockSetEnabled, expandSearch, normalizeInput } from '../core/native';
import { setFastDownloadsEnabled } from '../core/downloads';
import { isNewTabUrl } from '../browser/newtab';
import { clearFreshTab, freshTabId, noteFreshTab } from '../browser/navIntent';

const STATE_KEY = 'zenith.state.v1';
const BACKUP_KEY = 'zenith.state.backup.v1';

function tryParseState(raw: string | null): Partial<AppState> | null {
  if (!raw) {
    return null;
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? (value as Partial<AppState>) : null;
  } catch {
    return null;
  }
}

function stateScore(data: Partial<AppState> | null | undefined): number {
  if (!data) {
    return 0;
  }
  return (
    (data.tabs?.length ?? 0) * 4 +
    (data.bookmarks?.length ?? 0) * 3 +
    (data.history?.length ?? 0) +
    (data.scripts?.length ?? 0) +
    (data.extensions?.length ?? 0) +
    (data.profiles?.length ?? 0) +
    Object.keys(data.siteConfigs ?? {}).length
  );
}

export interface AppState {
  hydrated: boolean;
  settings: Settings;
  profiles: BrowserProfile[];
  activeProfileId: string;
  profileFocus: Record<string, ProfileFocus>;
  recentByProfile: Record<string, string[]>;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  tabs: Tab[];
  activeTabId: string | null;
  tabGroups: TabGroup[];
  splitTabIds: string[];
  scripts: UserScript[];
  extensions: Extension[];
  history: HistoryItem[];
  bookmarks: Bookmark[];
  siteConfigs: Record<string, SiteConfig>;
  userBlocklist: string;
  ui: UiState;
}

const initialUi: UiState = {
  screen: 'browser',
  omnibox: { open: false, mode: 'new', initial: '', incognito: false },
  tabSwitcher: false,
  compact: false,
  glanceUrl: null,
  linkMenu: null,
};

const initialState: AppState = {
  hydrated: false,
  settings: DEFAULT_SETTINGS,
  profiles: [DEFAULT_PROFILE],
  activeProfileId: DEFAULT_PROFILE_ID,
  profileFocus: {},
  recentByProfile: { [DEFAULT_PROFILE_ID]: [] },
  workspaces: DEFAULT_WORKSPACES,
  activeWorkspaceId: DEFAULT_WORKSPACES[0].id,
  tabs: [],
  activeTabId: null,
  tabGroups: [],
  splitTabIds: [],
  scripts: [],
  extensions: [],
  history: [],
  bookmarks: [],
  siteConfigs: {},
  userBlocklist: '',
  ui: initialUi,
};

let latestState: AppState = initialState;

export function getAppState(): AppState {
  return latestState;
}

export function profileTabs(state: AppState = latestState): Tab[] {
  const pid = state.activeProfileId || DEFAULT_PROFILE_ID;
  return state.tabs.filter((t) => (t.profileId || DEFAULT_PROFILE_ID) === pid);
}

function siteKey(profileId: string, host: string): string {
  return `${profileId}::${host}`;
}

function projectState(state: AppState): AppState {
  const pid = state.activeProfileId || DEFAULT_PROFILE_ID;
  const siteConfigs: Record<string, SiteConfig> = {};
  for (const [key, cfg] of Object.entries(state.siteConfigs)) {
    const owner = cfg.profileId || DEFAULT_PROFILE_ID;
    if (owner !== pid) {
      continue;
    }
    const host = cfg.host || key.split('::').pop() || key;
    siteConfigs[host] = cfg;
  }
  return {
    ...state,
    tabs: state.tabs.filter((t) => (t.profileId || DEFAULT_PROFILE_ID) === pid),
    workspaces: state.workspaces.filter((w) => (w.profileId || DEFAULT_PROFILE_ID) === pid),
    tabGroups: state.tabGroups.filter((g) => (g.profileId || DEFAULT_PROFILE_ID) === pid),
    scripts: state.scripts.filter((s) => (s.profileId || DEFAULT_PROFILE_ID) === pid),
    extensions: state.extensions.filter((e) => (e.profileId || DEFAULT_PROFILE_ID) === pid),
    history: state.history.filter((h) => (h.profileId || DEFAULT_PROFILE_ID) === pid),
    bookmarks: state.bookmarks.filter((b) => (b.profileId || DEFAULT_PROFILE_ID) === pid),
    siteConfigs,
    settings: {
      ...state.settings,
      recentSearches: state.recentByProfile[pid] ?? [],
    },
  };
}

type Action =
  | { type: 'HYDRATE'; state: Partial<AppState> | null }
  | { type: 'SET_UI'; patch: Partial<UiState> }
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'SET_OMNIBOX'; patch: Partial<OmniboxState> }
  | { type: 'ADD_TAB'; id: string; url: string; incognito?: boolean; workspaceId?: string; activate?: boolean }
  | { type: 'CLOSE_TAB'; id: string }
  | { type: 'CLOSE_OTHER_TABS'; keepId: string }
  | { type: 'CLOSE_ALL_TABS' }
  | { type: 'SET_ACTIVE_TAB'; id: string | null }
  | { type: 'SET_SPLIT'; ids: string[] }
  | { type: 'UPDATE_TAB'; id: string; patch: Partial<Tab> }
  | { type: 'MOVE_TAB'; id: string; workspaceId: string }
  | { type: 'ADD_GROUP'; id: string; name: string; color: string }
  | { type: 'UPDATE_GROUP'; id: string; patch: Partial<TabGroup> }
  | { type: 'DEL_GROUP'; id: string }
  | { type: 'SET_TAB_GROUP'; tabId: string; groupId: string | null }
  | { type: 'SET_ACTIVE_WORKSPACE'; id: string; tabId?: string }
  | { type: 'ADD_WORKSPACE'; id: string; name: string; icon: string }
  | { type: 'UPDATE_WORKSPACE'; id: string; patch: Partial<Workspace> }
  | { type: 'DEL_WORKSPACE'; id: string }
  | { type: 'ADD_SCRIPT'; script: UserScript }
  | { type: 'UPDATE_SCRIPT'; id: string; patch: Partial<UserScript> }
  | { type: 'DEL_SCRIPT'; id: string }
  | { type: 'MOVE_SCRIPT'; id: string; dir: -1 | 1 }
  | { type: 'ADD_EXTENSION'; extension: Extension }
  | { type: 'UPDATE_EXTENSION'; id: string; patch: Partial<Extension> }
  | { type: 'DEL_EXTENSION'; id: string }
  | { type: 'ADD_HISTORY'; item: HistoryItem }
  | { type: 'DEL_HISTORY'; url: string; at: number }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'ADD_BOOKMARK'; bookmark: Bookmark }
  | { type: 'DEL_BOOKMARK'; id: string }
  | { type: 'SET_SETTINGS'; patch: Partial<Settings> }
  | { type: 'ADD_RECENT_SEARCH'; query: string }
  | { type: 'SET_SITE_CONFIG'; host: string; patch: Partial<SiteConfig> }
  | { type: 'DEL_SITE_CONFIG'; host: string }
  | { type: 'SET_USER_BLOCKLIST'; text: string }
  | { type: 'ADD_PROFILE'; id: string; name: string; color: string }
  | { type: 'UPDATE_PROFILE'; id: string; patch: Partial<BrowserProfile> }
  | { type: 'DELETE_PROFILE'; id: string }
  | { type: 'SWITCH_PROFILE'; id: string }
  | { type: 'RESET_ALL' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'HYDRATE': {
      if (!action.state) {
        return { ...state, hydrated: true };
      }
      const p = action.state;
      const settings: Settings = {
        ...DEFAULT_SETTINGS,
        ...(p.settings ?? {}),
        engines:
          p.settings?.engines && p.settings.engines.length > 0
            ? p.settings.engines
            : DEFAULT_ENGINES,
        dns: { ...DEFAULT_SETTINGS.dns, ...(p.settings?.dns ?? {}) },
      };
      // Rekonsiliasi: tab aktif harus valid; kalau tidak, pakai tab pertama.
      // (bug v0.2: activeTabId basi → semua tombol bar bawah disabled)
      const profiles = p.profiles?.length ? p.profiles : [DEFAULT_PROFILE];
      const activeProfileId = profiles.some((x) => x.id === p.activeProfileId)
        ? (p.activeProfileId as string)
        : profiles[0].id;
      const stamp = <T extends { profileId?: string }>(items: T[] | undefined): T[] =>
        (items ?? []).map((item) => (item.profileId ? item : { ...item, profileId: DEFAULT_PROFILE_ID }));
      const tabs = stamp(p.tabs);
      const workspaces = stamp(p.workspaces?.length ? p.workspaces : DEFAULT_WORKSPACES);
      const profileTabs = tabs.filter((t) => t.profileId === activeProfileId);
      let activeTab = profileTabs.find((t) => t.id === p.activeTabId) ?? profileTabs[0] ?? null;
      const activeTabId = activeTab ? activeTab.id : null;
      const activeWorkspaceId = activeTab
        ? activeTab.workspaceId
        : (workspaces.find((w) => w.profileId === activeProfileId)?.id ?? DEFAULT_WORKSPACES[0].id);
      const siteConfigs: Record<string, SiteConfig> = {};
      for (const [key, cfg] of Object.entries(p.siteConfigs ?? {})) {
        const owner = cfg.profileId || DEFAULT_PROFILE_ID;
        const host = cfg.host || key.split('::').pop() || key;
        siteConfigs[siteKey(owner, host)] = { ...cfg, host, profileId: owner };
      }
      const recentByProfile = { ...(p.recentByProfile ?? {}) };
      if (!recentByProfile[DEFAULT_PROFILE_ID]) {
        recentByProfile[DEFAULT_PROFILE_ID] = p.settings?.recentSearches ?? [];
      }
      return {
        ...state,
        settings,
        profiles,
        activeProfileId,
        profileFocus: p.profileFocus ?? {},
        recentByProfile,
        workspaces,
        activeWorkspaceId,
        activeTabId,
        tabGroups: stamp(p.tabGroups),
        tabs,
        scripts: stamp(p.scripts),
        extensions: stamp(p.extensions),
        history: stamp(p.history),
        bookmarks: stamp(p.bookmarks),
        siteConfigs,
        userBlocklist: p.userBlocklist ?? '',
        splitTabIds: [],
        ui: initialUi,
        hydrated: true,
      };
    }
    case 'SET_UI':
      return { ...state, ui: { ...state.ui, ...action.patch } };
    case 'SET_SCREEN':
      return { ...state, ui: { ...state.ui, screen: action.screen } };
    case 'SET_OMNIBOX':
      return { ...state, ui: { ...state.ui, omnibox: { ...state.ui.omnibox, ...action.patch } } };
    case 'ADD_TAB': {
      // Grup target dari "Tab baru di grup ini" (TabSwitcher)
      let pendingGroup: string | null = null;
      try {
        const flag = (globalThis as any)?.__ZENITH_NEXT_GROUP;
        if (typeof flag === 'string' && state.tabGroups.some((g) => g.id === flag)) {
          pendingGroup = flag;
        }
        delete (globalThis as any).__ZENITH_NEXT_GROUP;
      } catch {
        // diabaikan
      }
      const activate = action.activate !== false;
      if (activate && action.id !== freshTabId()) {
        clearFreshTab();
      }
      const tab: Tab = {
        id: action.id,
        url: action.url,
        title: '',
        workspaceId: action.workspaceId ?? state.activeWorkspaceId,
        profileId: state.activeProfileId,
        groupId: pendingGroup,
        incognito: !!action.incognito,
        canGoBack: false,
        canGoForward: false,
        loading: false,
        progress: 0,
        createdAt: Date.now(),
        lastActiveAt: activate ? Date.now() : undefined,
      };
      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: activate ? tab.id : state.activeTabId,
        activeWorkspaceId: activate ? tab.workspaceId : state.activeWorkspaceId,
        splitTabIds: activate ? [] : state.splitTabIds,
        ui: { ...state.ui, tabSwitcher: false },
      };
    }
    case 'CLOSE_TAB': {
      if (action.id === freshTabId()) {
        clearFreshTab();
      }
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx < 0) {
        return state;
      }
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const splitTabIds = state.splitTabIds.filter((id) => id !== action.id);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === action.id) {
        const closed = state.tabs[idx];
        const same = (t: Tab) =>
          t.profileId === closed.profileId && t.workspaceId === closed.workspaceId;
        const next = tabs.find(same) ?? null;
        const neighbor = tabs.slice(0, idx).reverse().find(same) ?? next;
        activeTabId = neighbor ? neighbor.id : null;
      }
      return { ...state, tabs, splitTabIds, activeTabId };
    }
    case 'CLOSE_OTHER_TABS': {
      const keep = state.tabs.find((t) => t.id === action.keepId);
      if (!keep) {
        return state;
      }
      const tabs = state.tabs.filter(
        (t) => t.id === action.keepId || t.profileId !== keep.profileId || t.workspaceId !== keep.workspaceId,
      );
      return { ...state, tabs, activeTabId: keep.id };
    }
    case 'CLOSE_ALL_TABS':
      clearFreshTab();
      return {
        ...state,
        tabs: state.tabs.filter((t) => t.profileId !== state.activeProfileId),
        activeTabId: null,
      };
    case 'SET_ACTIVE_TAB':
      if (action.id !== freshTabId()) {
        clearFreshTab();
      }
      return {
        ...state,
        activeTabId: action.id,
        tabs: state.tabs.map((t) =>
          t.id === action.id ? { ...t, lastActiveAt: Date.now() } : t,
        ),
      };
    case 'SET_SPLIT':
      return { ...state, splitTabIds: action.ids.length === 2 ? action.ids : [] };
    case 'UPDATE_TAB': {
      const tabs = state.tabs.map((t) =>
        t.id === action.id ? { ...t, ...action.patch } : t,
      );
      return { ...state, tabs };
    }
    case 'MOVE_TAB': {
      const tabs = state.tabs.map((t) =>
        t.id === action.id ? { ...t, workspaceId: action.workspaceId } : t,
      );
      return { ...state, tabs };
    }
    case 'ADD_GROUP':
      return {
        ...state,
        tabGroups: [
          ...state.tabGroups,
          { id: action.id, name: action.name, color: action.color, createdAt: Date.now(), profileId: state.activeProfileId },
        ],
      };
    case 'UPDATE_GROUP':
      return {
        ...state,
        tabGroups: state.tabGroups.map((g) =>
          g.id === action.id ? { ...g, ...action.patch } : g,
        ),
      };
    case 'DEL_GROUP':
      return {
        ...state,
        tabGroups: state.tabGroups.filter((g) => g.id !== action.id),
        tabs: state.tabs.map((t) =>
          t.groupId === action.id ? { ...t, groupId: null } : t,
        ),
      };
    case 'SET_TAB_GROUP':
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId ? { ...t, groupId: action.groupId } : t,
        ),
      };
    case 'SET_ACTIVE_WORKSPACE': {
      // Jangan jatuhkan tab yang baru diaktifkan ke tab pertama workspace.
      const inWs = (t: Tab) =>
        t.workspaceId === action.id && t.profileId === state.activeProfileId;
      const pinned =
        (action.tabId ? state.tabs.find((t) => t.id === action.tabId && inWs(t)) : null) ??
        state.tabs.find((t) => t.id === state.activeTabId && inWs(t)) ??
        null;
      const first = state.tabs.find(inWs) ?? null;
      const next = pinned ?? first;
      if (!next || next.id !== freshTabId()) {
        clearFreshTab();
      }
      return {
        ...state,
        activeWorkspaceId: action.id,
        activeTabId: next ? next.id : null,
      };
    }
    case 'ADD_WORKSPACE':
      return {
        ...state,
        workspaces: [
          ...state.workspaces,
          { id: action.id, name: action.name, icon: action.icon, profileId: state.activeProfileId },
        ],
      };
    case 'UPDATE_WORKSPACE':
      return {
        ...state,
        workspaces: state.workspaces.map((w) =>
          w.id === action.id ? { ...w, ...action.patch } : w,
        ),
      };
    case 'DEL_WORKSPACE': {
      const mine = state.workspaces.filter((w) => w.profileId === state.activeProfileId);
      if (mine.length <= 1) {
        return state;
      }
      const workspaces = state.workspaces.filter((w) => w.id !== action.id);
      const fallback = workspaces.find((w) => w.profileId === state.activeProfileId) ?? mine[0];
      const tabs = state.tabs.map((t) =>
        t.workspaceId === action.id && t.profileId === state.activeProfileId
          ? { ...t, workspaceId: fallback.id }
          : t,
      );
      return {
        ...state,
        workspaces,
        tabs,
        activeWorkspaceId:
          state.activeWorkspaceId === action.id ? fallback.id : state.activeWorkspaceId,
      };
    }
    case 'ADD_SCRIPT':
      return {
        ...state,
        scripts: [...state.scripts, { ...action.script, profileId: action.script.profileId || state.activeProfileId }],
      };
    case 'UPDATE_SCRIPT':
      return {
        ...state,
        scripts: state.scripts.map((s) =>
          s.id === action.id ? { ...s, ...action.patch } : s,
        ),
      };
    case 'DEL_SCRIPT':
      return { ...state, scripts: state.scripts.filter((s) => s.id !== action.id) };
    case 'MOVE_SCRIPT': {
      const mine = state.scripts.filter((s) => s.profileId === state.activeProfileId);
      const local = mine.findIndex((s) => s.id === action.id);
      const next = local + action.dir;
      if (local < 0 || next < 0 || next >= mine.length) {
        return state;
      }
      const reordered = [...mine];
      const [moved] = reordered.splice(local, 1);
      reordered.splice(next, 0, moved);
      let i = 0;
      const scripts = state.scripts.map((s) =>
        s.profileId === state.activeProfileId ? reordered[i++] : s,
      );
      return { ...state, scripts };
    }
    case 'ADD_EXTENSION':
      return {
        ...state,
        extensions: [
          ...state.extensions,
          { ...action.extension, profileId: action.extension.profileId || state.activeProfileId },
        ],
      };
    case 'UPDATE_EXTENSION':
      return {
        ...state,
        extensions: state.extensions.map((e) =>
          e.id === action.id ? { ...e, ...action.patch } : e,
        ),
      };
    case 'DEL_EXTENSION':
      return { ...state, extensions: state.extensions.filter((e) => e.id !== action.id) };
    case 'ADD_HISTORY': {
      const item = { ...action.item, profileId: action.item.profileId || state.activeProfileId };
      const mine = state.history.filter((h) => h.profileId === item.profileId);
      const others = state.history.filter((h) => h.profileId !== item.profileId);
      const filtered = mine.filter((h) => h.url !== item.url || item.at - h.at > 60_000);
      return { ...state, history: [item, ...filtered].slice(0, 500).concat(others) };
    }
    case 'DEL_HISTORY':
      return {
        ...state,
        history: state.history.filter((h) => h.url !== action.url || h.at !== action.at),
      };
    case 'CLEAR_HISTORY':
      return {
        ...state,
        history: state.history.filter((h) => h.profileId !== state.activeProfileId),
      };
    case 'ADD_BOOKMARK':
      return {
        ...state,
        bookmarks: [
          { ...action.bookmark, profileId: action.bookmark.profileId || state.activeProfileId },
          ...state.bookmarks,
        ],
      };
    case 'DEL_BOOKMARK':
      return { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== action.id) };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'ADD_RECENT_SEARCH': {
      const q = action.query.trim();
      if (!q) {
        return state;
      }
      const prev = state.recentByProfile[state.activeProfileId] ?? [];
      const recent = [q, ...prev.filter((x) => x !== q)].slice(0, 10);
      return {
        ...state,
        recentByProfile: { ...state.recentByProfile, [state.activeProfileId]: recent },
      };
    }
    case 'SET_SITE_CONFIG': {
      const key = siteKey(state.activeProfileId, action.host);
      const current = state.siteConfigs[key] ?? { host: action.host, profileId: state.activeProfileId };
      const merged: SiteConfig = {
        ...current,
        ...action.patch,
        host: action.host,
        profileId: state.activeProfileId,
      };
      const siteConfigs = { ...state.siteConfigs, [key]: merged };
      if (
        merged.javascriptEnabled === undefined &&
        merged.adblockEnabled === undefined &&
        !merged.userAgent &&
        !merged.customCss &&
        merged.httpsUpgrades === undefined
      ) {
        delete siteConfigs[key];
      }
      return { ...state, siteConfigs };
    }
    case 'DEL_SITE_CONFIG': {
      const siteConfigs = { ...state.siteConfigs };
      delete siteConfigs[siteKey(state.activeProfileId, action.host)];
      delete siteConfigs[action.host];
      return { ...state, siteConfigs };
    }
    case 'ADD_PROFILE': {
      if (state.profiles.some((p) => p.id === action.id)) {
        return state;
      }
      return {
        ...state,
        profiles: [
          ...state.profiles,
          { id: action.id, name: action.name.trim() || 'Profil', color: action.color, createdAt: Date.now() },
        ],
        workspaces: [...state.workspaces, ...workspacesForProfile(action.id)],
        recentByProfile: { ...state.recentByProfile, [action.id]: [] },
      };
    }
    case 'UPDATE_PROFILE':
      return {
        ...state,
        profiles: state.profiles.map((p) => (p.id === action.id ? { ...p, ...action.patch, id: p.id } : p)),
      };
    case 'DELETE_PROFILE': {
      if (state.profiles.length <= 1 || !state.profiles.some((p) => p.id === action.id)) {
        return state;
      }
      const profiles = state.profiles.filter((p) => p.id !== action.id);
      const nextId = state.activeProfileId === action.id ? profiles[0].id : state.activeProfileId;
      const nextTabs = state.tabs.filter((t) => t.profileId === nextId);
      const nextWs = state.workspaces.find((w) => w.profileId === nextId);
      const focus = state.profileFocus[nextId];
      const activeTab =
        nextTabs.find((t) => t.id === focus?.tabId) ?? nextTabs[0] ?? null;
      const recentByProfile = { ...state.recentByProfile };
      delete recentByProfile[action.id];
      const profileFocus = { ...state.profileFocus };
      delete profileFocus[action.id];
      return {
        ...state,
        profiles,
        activeProfileId: nextId,
        activeTabId: activeTab ? activeTab.id : null,
        activeWorkspaceId: activeTab?.workspaceId ?? nextWs?.id ?? focus?.workspaceId ?? state.activeWorkspaceId,
        profileFocus,
        recentByProfile,
        tabs: state.tabs.filter((t) => t.profileId !== action.id),
        workspaces: state.workspaces.filter((w) => w.profileId !== action.id),
        tabGroups: state.tabGroups.filter((g) => g.profileId !== action.id),
        scripts: state.scripts.filter((s) => s.profileId !== action.id),
        extensions: state.extensions.filter((e) => e.profileId !== action.id),
        history: state.history.filter((h) => h.profileId !== action.id),
        bookmarks: state.bookmarks.filter((b) => b.profileId !== action.id),
        siteConfigs: Object.fromEntries(
          Object.entries(state.siteConfigs).filter(([, cfg]) => cfg.profileId !== action.id),
        ),
      };
    }
    case 'SWITCH_PROFILE': {
      if (!state.profiles.some((p) => p.id === action.id) || action.id === state.activeProfileId) {
        return state;
      }
      clearFreshTab();
      const profileFocus = {
        ...state.profileFocus,
        [state.activeProfileId]: {
          tabId: state.activeTabId,
          workspaceId: state.activeWorkspaceId,
        },
      };
      const focus = profileFocus[action.id];
      const tabs = state.tabs.filter((t) => t.profileId === action.id);
      const workspaces = state.workspaces.filter((w) => w.profileId === action.id);
      const activeTab =
        tabs.find((t) => t.id === focus?.tabId) ?? tabs[0] ?? null;
      const workspaceId =
        activeTab?.workspaceId ??
        (workspaces.some((w) => w.id === focus?.workspaceId) ? focus?.workspaceId : workspaces[0]?.id) ??
        state.activeWorkspaceId;
      return {
        ...state,
        activeProfileId: action.id,
        profileFocus,
        activeTabId: activeTab ? activeTab.id : null,
        activeWorkspaceId: workspaceId,
        splitTabIds: [],
        ui: { ...state.ui, screen: 'browser', tabSwitcher: false, omnibox: { ...state.ui.omnibox, open: false } },
      };
    }
    case 'SET_USER_BLOCKLIST':
      return { ...state, userBlocklist: action.text };
    case 'RESET_ALL':
      return { ...initialState, hydrated: true };
    default:
      return state;
  }
}

interface StoreApi {
  state: AppState;
  fullState: AppState;
  dispatch: React.Dispatch<Action>;
  switchProfile: (id: string) => Promise<void>;
  activeTab: Tab | null;
  activeEngine: Settings['engines'][number];
  tabsInWorkspace: (workspaceId: string) => Tab[];
  siteConfigFor: (url: string) => SiteConfig | undefined;
  resolveInput: (text: string) => Promise<{ url: string; isSearch: boolean }>;
  openNewTab: (
    url: string,
    opts?: { incognito?: boolean; workspaceId?: string; id?: string; activate?: boolean },
  ) => string;
}

const StoreContext = createContext<StoreApi | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  latestState = state;
  const stateRef = useRef(state);
  stateRef.current = state;
  // Jangan timpa blob yang gagal dibaca dengan state kosong.
  const persistAllowed = useRef(false);
  const cookiesRestored = useRef(false);

  const persistNow = useCallback((snapshot: AppState) => {
    if (!snapshot.hydrated || !persistAllowed.current) {
      return;
    }
    const { ui, hydrated, splitTabIds, ...persist } = snapshot;
    const text = JSON.stringify(persist);
    AsyncStorage.multiSet([
      [STATE_KEY, text],
      [BACKUP_KEY, text],
    ]).catch(() => {});
    writeStateBackup(text).catch(() => {});
  }, []);

  // ---- hidrasi sekali di awal
  useEffect(() => {
    let alive = true;
    (async () => {
      let raw: string | null = null;
      let backupRaw: string | null = null;
      let fileRaw: string | null = null;
      try {
        const pair = await AsyncStorage.multiGet([STATE_KEY, BACKUP_KEY]);
        raw = pair[0]?.[1] ?? null;
        backupRaw = pair[1]?.[1] ?? null;
      } catch {
        raw = null;
        backupRaw = null;
      }
      fileRaw = await readStateBackup();
      const candidates = [tryParseState(raw), tryParseState(backupRaw), tryParseState(fileRaw)].filter(
        (item): item is Partial<AppState> => item != null,
      );
      candidates.sort((a, b) => stateScore(b) - stateScore(a));
      const persisted = candidates[0] ?? null;
      const sawBlob = [raw, backupRaw, fileRaw].some((item) => !!item && item.length > 2);
      persistAllowed.current = persisted != null || !sawBlob;
      if (alive) {
        const id =
          persisted?.activeProfileId && persisted.profiles?.some((p) => p.id === persisted.activeProfileId)
            ? persisted.activeProfileId
            : DEFAULT_PROFILE_ID;
        await setActiveBrowserProfile(id);
        if (alive) {
          dispatch({ type: 'HYDRATE', state: persisted });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- simpan (debounce) + flush saat aplikasi pergi ke latar
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      persistNow(stateRef.current);
    }, 1200);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [state, persistNow]);

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
        }
        persistNow(stateRef.current);
        flushCookies().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [persistNow]);

  useEffect(() => {
    if (!state.hydrated || cookiesRestored.current) {
      return;
    }
    cookiesRestored.current = true;
    const urls = new Set<string>();
    for (const tab of state.tabs) {
      if (tab.url) {
        urls.add(tab.url);
      }
    }
    for (const item of state.history) {
      if (item.url) {
        urls.add(item.url);
      }
    }
    for (const item of state.bookmarks) {
      if (item.url) {
        urls.add(item.url);
      }
    }
    restorePrimaryCookies([...urls]).catch(() => {});
  }, [state.hydrated, state.tabs, state.history, state.bookmarks]);

  // ---- sinkronisasi mesin adblock (Rust)
  useEffect(() => {
    adblockSetEnabled(state.settings.adblockEnabled);
  }, [state.settings.adblockEnabled]);

  // ---- unduhan cepat (Via) aktif/nonaktif
  useEffect(() => {
    setFastDownloadsEnabled(state.settings.fastDownloads);
  }, [state.settings.fastDownloads]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const hosts = new Set<string>();
      for (const cfg of Object.values(state.siteConfigs)) {
        if (cfg.host) {
          hosts.add(cfg.host);
        }
      }
      for (const host of hosts) {
        if (cancelled) {
          return;
        }
        const mine = Object.values(state.siteConfigs).find(
          (cfg) => cfg.host === host && (cfg.profileId || DEFAULT_PROFILE_ID) === state.activeProfileId,
        );
        await adblockAllowHost(host, mine ? mine.adblockEnabled !== false : true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.siteConfigs, state.activeProfileId]);

  useEffect(() => {
    if (state.hydrated && state.userBlocklist) {
      adblockInit(state.userBlocklist, 'replace');
    }
  }, [state.hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const view = useMemo(() => projectState(state), [state]);

  const activeTab = useMemo(
    () => view.tabs.find((t) => t.id === view.activeTabId) ?? null,
    [view.tabs, view.activeTabId],
  );

  const activeEngine = useMemo(
    () =>
      state.settings.engines.find((e) => e.id === state.settings.defaultEngineId) ??
      state.settings.engines[0] ??
      DEFAULT_ENGINES[0],
    [state.settings.engines, state.settings.defaultEngineId],
  );

  const tabsInWorkspace = useCallback(
    (workspaceId: string) => view.tabs.filter((t) => t.workspaceId === workspaceId),
    [view.tabs],
  );

  const siteConfigFor = useCallback(
    (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return view.siteConfigs[host];
      } catch {
        return undefined;
      }
    },
    [view.siteConfigs],
  );

  const switchProfile = useCallback(async (id: string) => {
    await setActiveBrowserProfile(id);
    dispatch({ type: 'SWITCH_PROFILE', id });
  }, []);

  const resolveInput = useCallback(
    async (text: string) => {
      const url = await normalizeInput(text, activeEngine.urlTemplate);
      const searchUrl = await expandSearch(activeEngine.urlTemplate, text);
      return { url, isSearch: url === searchUrl && !!text.trim() };
    },
    [activeEngine],
  );

  const openNewTab = useCallback(
    (url: string, opts?: { incognito?: boolean; workspaceId?: string; id?: string; activate?: boolean }) => {
      const id = opts?.id ?? uid('t-');
      if (isNewTabUrl(url) && opts?.activate !== false) {
        noteFreshTab(id);
      }
      dispatch({
        type: 'ADD_TAB',
        id,
        url,
        incognito: opts?.incognito,
        workspaceId: opts?.workspaceId,
        activate: opts?.activate,
      });
      return id;
    },
    [],
  );

  const apiDispatch = useCallback((action: Action) => {
    if (action.type === 'RESET_ALL') {
      persistAllowed.current = true;
    }
    dispatch(action);
  }, []);

  const value = useMemo<StoreApi>(
    () => ({
      state: view,
      fullState: state,
      dispatch: apiDispatch,
      switchProfile,
      activeTab,
      activeEngine,
      tabsInWorkspace,
      siteConfigFor,
      resolveInput,
      openNewTab,
    }),
    [view, state, apiDispatch, switchProfile, activeTab, activeEngine, tabsInWorkspace, siteConfigFor, resolveInput, openNewTab],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreApi {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore harus dipakai di dalam StoreProvider');
  }
  return ctx;
}

// ---------------- pemilih & util kecil ----------------

export function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isBookmarked(state: AppState, url: string): Bookmark | undefined {
  return state.bookmarks.find((b) => b.url === url);
}
