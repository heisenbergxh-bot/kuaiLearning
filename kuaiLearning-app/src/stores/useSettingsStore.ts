import { create } from 'zustand';
import type { Settings, AIProvider, Language } from '../types';
import { AI_PROVIDERS as PROVIDERS } from '../types';

const SETTINGS_KEY = 'kuailearning-settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { apiKey: '', apiBaseUrl: PROVIDERS.deepseek.baseUrl, model: PROVIDERS.deepseek.models[0], language: 'zh' };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface SettingsState {
  settings: Settings;
  setApiKey: (key: string) => void;
  setProvider: (provider: AIProvider) => void;
  setCustomBaseUrl: (url: string) => void;
  setModel: (model: string) => void;
  setLanguage: (lang: Language) => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: loadSettings(),

  setApiKey: (apiKey: string) => {
    const s = { ...get().settings, apiKey };
    saveSettings(s);
    set({ settings: s });
  },

  setProvider: (provider: AIProvider) => {
    const p = PROVIDERS[provider];
    const s = { ...get().settings, apiBaseUrl: p.baseUrl, model: p.models[0] || '' };
    saveSettings(s);
    set({ settings: s });
  },

  setCustomBaseUrl: (apiBaseUrl: string) => {
    const s = { ...get().settings, apiBaseUrl };
    saveSettings(s);
    set({ settings: s });
  },

  setModel: (model: string) => {
    const s = { ...get().settings, model };
    saveSettings(s);
    set({ settings: s });
  },

  setLanguage: (language: Language) => {
    const s = { ...get().settings, language };
    saveSettings(s);
    set({ settings: s });
  },
}));
