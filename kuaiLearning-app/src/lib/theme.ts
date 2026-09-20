import type { ThemePreference } from '../types';

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia(DARK_MODE_QUERY).matches ? 'dark' : 'light';
  }
  return preference;
}

export function applyTheme(preference: ThemePreference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

export function readStoredTheme(): ThemePreference {
  try {
    const raw = localStorage.getItem('kuailearning-settings');
    const theme = raw ? JSON.parse(raw).theme : undefined;
    if (theme === 'light' || theme === 'dark') return theme;
  } catch { /* fall back to the system preference */ }
  return 'system';
}

export const darkModeQuery = DARK_MODE_QUERY;
