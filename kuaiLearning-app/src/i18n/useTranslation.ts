import { useSettingsStore } from '../stores/useSettingsStore';
import { translations, type TranslationKey } from './translations';

export function useTranslation() {
  const lang = useSettingsStore(s => s.settings.language || 'zh');

  function t(key: TranslationKey, params?: Record<string, string>): string {
    const entry = translations[key];
    if (!entry) return key;

    let text: string = entry[lang] || entry.en || key;

    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
      }
    }

    return text;
  }

  return { t, lang };
}
