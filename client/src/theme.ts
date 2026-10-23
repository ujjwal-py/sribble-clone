export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'scribble-theme';

export function getInitialTheme(): Theme {
  // The inline script in index.html applies the theme before React renders.
  const applied = document.documentElement.dataset.theme;
  if (applied === 'light' || applied === 'dark') return applied;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage can be unavailable in private browsing contexts.
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', theme === 'dark' ? '#0b1020' : '#4f46e5');

  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The visual theme still applies for this session if storage is blocked.
  }
}
