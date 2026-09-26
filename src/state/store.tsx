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
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Bookmark,
  Extension,
  HistoryItem,
  OmniboxState,
  Screen,
  Settings,
  SiteConfig,
  Tab,
  UiState,
  UserScript,
  Workspace,
} from '../types';
import { DEFAULT_ENGINES, DEFAULT_SETTINGS, DEFAULT_WORKSPACES, uid } from './defaults';
import { adblockAllowHost, adblockInit, adblockSetEnabled, expandSearch, normalizeInput } from '../core/native';
import { setFastDownloadsEnabled } from '../core/downloads';

const STATE_KEY = 'zenith.state.v1';

export interface AppState {
  hydrated: boolean;
  settings: Settings;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  tabs: Tab[];
  activeTabId: string | null;
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
  workspaces: DEFAULT_WORKSPACES,
  activeWorkspaceId: DEFAULT_WORKSPACES[0].id,
  tabs: [],
  activeTabId: null,
  splitTabIds: [],
  scripts: [],
  extensions: [],
  history: [],
  bookmarks: [],
  siteConfigs: {},
  userBlocklist: '',
  ui: initialUi,
};

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
  | { type: 'SET_ACTIVE_WORKSPACE'; id: string }
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
  | { type: 'CLEAR_HISTORY' }
  | { type: 'ADD_BOOKMARK'; bookmark: Bookmark }
  | { type: 'DEL_BOOKMARK'; id: string }
  | { type: 'SET_SETTINGS'; patch: Partial<Settings> }
  | { type: 'ADD_RECENT_SEARCH'; query: string }
  | { type: 'SET_SITE_CONFIG'; host: string; patch: Partial<SiteConfig> }
  | { type: 'DEL_SITE_CONFIG'; host: string }
  | { type: 'SET_USER_BLOCKLIST'; text: string }
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
      };
      // Rekonsiliasi: workspace aktif harus mengikuti tab aktif (bug fix)
      const tabs = p.tabs ?? [];
      const activeTab = tabs.find((t) => t.id === p.activeTabId) ?? null;
      const activeWorkspaceId = activeTab
        ? activeTab.workspaceId
        : (p.activeWorkspaceId ?? DEFAULT_WORKSPACES[0].id);
      return {
        ...state,
        settings,
        workspaces: p.workspaces?.length ? p.workspaces : DEFAULT_WORKSPACES,
        activeWorkspaceId,
        tabs,
        activeTabId: p.activeTabId ?? null,
        scripts: p.scripts ?? [],
        extensions: p.extensions ?? [],
        history: p.history ?? [],
        bookmarks: p.bookmarks ?? [],
        siteConfigs: p.siteConfigs ?? {},
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
      const tab: Tab = {
        id: action.id,
        url: action.url,
        title: '',
        workspaceId: action.workspaceId ?? state.activeWorkspaceId,
        incognito: !!action.incognito,
        canGoBack: false,
        canGoForward: false,
        loading: false,
        progress: 0,
        createdAt: Date.now(),
      };
      const activate = action.activate !== false;
      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: activate ? tab.id : state.activeTabId,
        activeWorkspaceId: activate ? tab.workspaceId : state.activeWorkspaceId,
        ui: { ...state.ui, tabSwitcher: false },
      };
    }
    case 'CLOSE_TAB': {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx < 0) {
        return state;
      }
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      const splitTabIds = state.splitTabIds.filter((id) => id !== action.id);
      let activeTabId = state.activeTabId;
      if (state.activeTabId === action.id) {
        const next =
          tabs.filter((t) => t.workspaceId === state.tabs[idx].workspaceId)[0] ?? null;
        const neighbor =
          tabs
            .slice(0, idx)
            .reverse()
            .find((t) => t.workspaceId === state.tabs[idx].workspaceId) ??
          next;
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
        (t) => t.id === action.keepId || t.workspaceId !== keep.workspaceId,
      );
      return { ...state, tabs, activeTabId: keep.id };
    }
    case 'CLOSE_ALL_TABS':
      return { ...state, tabs: [], activeTabId: null };
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.id };
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
    case 'SET_ACTIVE_WORKSPACE': {
      const first = state.tabs.find((t) => t.workspaceId === action.id) ?? null;
      return {
        ...state,
        activeWorkspaceId: action.id,
        activeTabId: first ? first.id : null,
      };
    }
    case 'ADD_WORKSPACE':
      return {
        ...state,
        workspaces: [...state.workspaces, { id: action.id, name: action.name, icon: action.icon }],
      };
    case 'UPDATE_WORKSPACE':
      return {
        ...state,
        workspaces: state.workspaces.map((w) =>
          w.id === action.id ? { ...w, ...action.patch } : w,
        ),
      };
    case 'DEL_WORKSPACE': {
      if (state.workspaces.length <= 1) {
        return state;
      }
      const workspaces = state.workspaces.filter((w) => w.id !== action.id);
      const fallback = workspaces[0];
      const tabs = state.tabs.map((t) =>
        t.workspaceId === action.id ? { ...t, workspaceId: fallback.id } : t,
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
      return { ...state, scripts: [...state.scripts, action.script] };
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
      const idx = state.scripts.findIndex((s) => s.id === action.id);
      const target = idx + action.dir;
      if (idx < 0 || target < 0 || target >= state.scripts.length) {
        return state;
      }
      const scripts = [...state.scripts];
      const [moved] = scripts.splice(idx, 1);
      scripts.splice(target, 0, moved);
      return { ...state, scripts };
    }
    case 'ADD_EXTENSION':
      return { ...state, extensions: [...state.extensions, action.extension] };
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
      const item = action.item;
      const filtered = state.history.filter(
        (h) => h.url !== item.url || item.at - h.at > 60_000,
      );
      const history = [item, ...filtered].slice(0, 500);
      return { ...state, history };
    }
    case 'CLEAR_HISTORY':
      return { ...state, history: [] };
    case 'ADD_BOOKMARK':
      return { ...state, bookmarks: [action.bookmark, ...state.bookmarks] };
    case 'DEL_BOOKMARK':
      return { ...state, bookmarks: state.bookmarks.filter((b) => b.id !== action.id) };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'ADD_RECENT_SEARCH': {
      const q = action.query.trim();
      if (!q) {
        return state;
      }
      const recentSearches = [q, ...state.settings.recentSearches.filter((x) => x !== q)].slice(0, 10);
      return { ...state, settings: { ...state.settings, recentSearches } };
    }
    case 'SET_SITE_CONFIG': {
      const current = state.siteConfigs[action.host] ?? { host: action.host };
      const merged: SiteConfig = { ...current, ...action.patch, host: action.host };
      const siteConfigs = { ...state.siteConfigs, [action.host]: merged };
      if (
        merged.javascriptEnabled === undefined &&
        merged.adblockEnabled === undefined &&
        !merged.userAgent &&
        !merged.customCss
      ) {
        delete siteConfigs[action.host];
      }
      return { ...state, siteConfigs };
    }
    case 'DEL_SITE_CONFIG': {
      const siteConfigs = { ...state.siteConfigs };
      delete siteConfigs[action.host];
      return { ...state, siteConfigs };
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
  dispatch: React.Dispatch<Action>;
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

  // ---- hidrasi sekali di awal
  useEffect(() => {
    let alive = true;
    (async () => {
      let persisted: Partial<AppState> | null = null;
      try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        if (raw) {
          persisted = JSON.parse(raw);
        }
      } catch {
        persisted = null;
      }
      if (alive) {
        dispatch({ type: 'HYDRATE', state: persisted });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ---- simpan (debounce)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.hydrated) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      const { ui, hydrated, splitTabIds, ...persist } = state;
      AsyncStorage.setItem(STATE_KEY, JSON.stringify(persist)).catch(() => {});
    }, 1200);
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, [state]);

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
      for (const [host, cfg] of Object.entries(state.siteConfigs)) {
        if (cancelled) {
          return;
        }
        await adblockAllowHost(host, cfg.adblockEnabled !== false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.siteConfigs]);

  useEffect(() => {
    if (state.hydrated && state.userBlocklist) {
      adblockInit(state.userBlocklist, 'replace');
    }
  }, [state.hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = useMemo(
    () => state.tabs.find((t) => t.id === state.activeTabId) ?? null,
    [state.tabs, state.activeTabId],
  );

  const activeEngine = useMemo(
    () =>
      state.settings.engines.find((e) => e.id === state.settings.defaultEngineId) ??
      state.settings.engines[0] ??
      DEFAULT_ENGINES[0],
    [state.settings.engines, state.settings.defaultEngineId],
  );

  const tabsInWorkspace = useCallback(
    (workspaceId: string) => state.tabs.filter((t) => t.workspaceId === workspaceId),
    [state.tabs],
  );

  const siteConfigFor = useCallback(
    (url: string) => {
      try {
        const host = new URL(url).hostname.toLowerCase();
        return state.siteConfigs[host];
      } catch {
        return undefined;
      }
    },
    [state.siteConfigs],
  );

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

  const value = useMemo<StoreApi>(
    () => ({
      state,
      dispatch,
      activeTab,
      activeEngine,
      tabsInWorkspace,
      siteConfigFor,
      resolveInput,
      openNewTab,
    }),
    [state, activeTab, activeEngine, tabsInWorkspace, siteConfigFor, resolveInput, openNewTab],
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
