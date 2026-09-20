import { create } from 'zustand';
import type { Settings, Language, ThemePreference } from '../types';

const SETTINGS_KEY = 'kuailearning-settings';

function loadSettings(): Settings {
  let language: Language = 'zh';
  let theme: ThemePreference = 'system';
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      if (saved.language === 'en') language = 'en';
      if (saved.theme === 'light' || saved.theme === 'dark') theme = saved.theme;
      // Remove credentials left by older versions; only UI preferences stay local.
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language, theme }));
    }
  } catch { /* use the default language */ }
  return { language, theme };
}

interface SettingsState {
  settings: Settings;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadSettings(),
  setLanguage: (language) => {
    set(state => {
      const settings = { ...state.settings, language };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return { settings };
    });
  },
  setTheme: (theme) => {
    set(state => {
      const settings = { ...state.settings, theme };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return { settings };
    });
  },
}));
