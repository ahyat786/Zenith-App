import type { SearchEngine, Settings } from '../types';

export const DEFAULT_ENGINES: SearchEngine[] = [
  {
    id: 'google',
    name: 'Google',
    urlTemplate: 'https://www.google.com/search?q=%s',
    suggestUrl: 'https://suggestqueries.googleapis.com/complete/search?client=firefox&q=%s',
    builtin: true,
  },
  {
    id: 'ddg',
    name: 'DuckDuckGo',
    urlTemplate: 'https://duckduckgo.com/?q=%s',
    suggestUrl: 'https://duckduckgo.com/ac/?q=%s&type=list',
    builtin: true,
  },
  {
    id: 'bing',
    name: 'Bing',
    urlTemplate: 'https://www.bing.com/search?q=%s',
    suggestUrl: 'https://api.bing.com/osjson.aspx?query=%s',
    builtin: true,
  },
  {
    id: 'brave',
    name: 'Brave Search',
    urlTemplate: 'https://search.brave.com/search?q=%s',
    suggestUrl: 'https://search.brave.com/api/suggest?q=%s',
    builtin: true,
  },
  {
    id: 'wikipedia-id',
    name: 'Wikipedia (ID)',
    urlTemplate: 'https://id.wikipedia.org/w/index.php?search=%s',
    suggestUrl: 'https://id.wikipedia.org/w/api.php?action=opensearch&search=%s&limit=8&namespace=0&format=json',
    builtin: true,
  },
];

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  barPosition: 'bottom',
  showWorkspaceBar: true,
  defaultEngineId: 'google',
  engines: DEFAULT_ENGINES,
  searchSuggestions: true,
  recentSearches: [],
  adblockEnabled: true,
  httpsUpgrades: true,
  fastDownloads: true,
  customCss: '',
  homepage: '',
};

export const DEFAULT_WORKSPACES = [
  { id: 'ws-personal', name: 'Pribadi', icon: '🏠' },
  { id: 'ws-work', name: 'Kerja', icon: '💼' },
];

export const WORKSPACE_ICONS = [
  '🏠', '💼', '📚', '🎮', '🛒', '🎬', '🎵', '🌐', '🔬', '💬', '✈️', '💡',
];

export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}
