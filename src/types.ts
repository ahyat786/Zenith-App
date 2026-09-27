export type Screen =
  | 'browser'
  | 'settings'
  | 'scripts'
  | 'extensions'
  | 'siteSettings'
  | 'downloads'
  | 'about';

export interface Workspace {
  id: string;
  name: string;
  icon: string; // emoji
}

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

export interface Tab {
  id: string;
  url: string;
  title: string;
  workspaceId: string;
  groupId?: string | null;
  incognito: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
  progress: number;
  createdAt: number;
  /** Terakhir kali tab menjadi aktif — untuk seksi "tidak aktif" (Chrome-style). */
  lastActiveAt?: number;
}

export interface UserScriptMeta {
  name?: string;
  namespace?: string;
  version?: string;
  description?: string;
  author?: string;
  icon?: string;
  homepageUrl?: string;
  updateUrl?: string;
  downloadUrl?: string;
  runAt: string; // document-start | document-end | document-idle
  noframes: boolean;
  matches: string[];
  includes: string[];
  excludes: string[];
  grants: string[];
  requires: string[];
}

export interface UserScript {
  id: string;
  code: string;
  body: string; // kode tanpa blok metadata
  meta: UserScriptMeta;
  hasHeader: boolean;
  enabled: boolean;
  matchAll: boolean; // jalankan di semua http(s) bila tanpa pola
  updatedAt: number;
}

export interface NormalizedContentScript {
  matches: string[];
  excludeMatches: string[];
  js: string[];
  css: string[];
  runAt: string;
  allFrames: boolean;
}

export interface Extension {
  id: string;
  name: string;
  version: string;
  description?: string;
  manifestVersion: number;
  permissions: string[];
  hostPermissions: string[];
  contentScripts: NormalizedContentScript[];
  enabled: boolean;
  hasBackground: boolean;
  iconLetter: string;
  files: Record<string, string>; // path -> isi js/css
  importedAt: number;
}

export interface SearchEngine {
  id: string;
  name: string;
  urlTemplate: string; // memakai %s
  suggestUrl?: string; // JSON [q, [saran]]
  builtin: boolean;
}

export interface SiteConfig {
  host: string;
  javascriptEnabled?: boolean;
  adblockEnabled?: boolean; // false = host masuk allowlist
  userAgent?: string; // '' = bawaan
  customCss?: string;
  httpsUpgrades?: boolean; // false = jangan paksa https utk situs ini
}

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  barPosition: 'bottom' | 'top';
  showWorkspaceBar: boolean;
  defaultEngineId: string;
  engines: SearchEngine[];
  searchSuggestions: boolean;
  recentSearches: string[]; // ala Zen: pencarian terakhir muncul di omnibox
  adblockEnabled: boolean;
  httpsUpgrades: boolean; // ala Brave: paksa https://
  fastDownloads: boolean; // ala Via: unduhan multi-thread
  customCss: string; // CSS global (userstyle ala Via)
  homepage: string; // '' = overlay awal
  dns: import('./core/dns').DnsSettings; // Shield Guard: kelompok DNS utama/cadangan
}

export interface HistoryItem {
  url: string;
  title: string;
  at: number;
}

export interface Bookmark {
  id: string;
  url: string;
  title: string;
}

export interface OmniboxState {
  open: boolean;
  mode: 'new' | 'edit';
  initial: string;
  incognito: boolean;
}

export interface UiState {
  screen: Screen;
  omnibox: OmniboxState;
  tabSwitcher: boolean;
  compact: boolean;
  glanceUrl: string | null;
  linkMenu: { url: string; text: string } | null;
}
