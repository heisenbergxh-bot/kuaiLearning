import { create } from 'zustand';
import type { Settings, Language } from '../types';

const SETTINGS_KEY = 'kuailearning-settings';

function loadSettings(): Settings {
  let language: Language = 'zh';
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw && JSON.parse(raw).language === 'en') language = 'en';
    // Remove credentials left by older versions; only language stays local.
    if (raw) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ language }));
  } catch { /* use the default language */ }
  return { language };
}

interface SettingsState {
  settings: Settings;
  setLanguage: (language: Language) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: loadSettings(),
  setLanguage: (language) => {
    const settings = { language };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    set({ settings });
  },
}));
