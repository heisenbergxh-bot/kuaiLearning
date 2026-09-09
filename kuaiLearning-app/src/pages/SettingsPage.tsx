import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { ServerAISettings } from '../components/ServerAISettings';

export function SettingsPage() {
  const { settings, setLanguage } = useSettingsStore();
  const { t } = useTranslation();

  return (
    <div className="fade-in max-w-lg">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('settingsTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('settingsDesc')}</p>

      <div className="space-y-5">
        {/* Language */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('languageLabel')}
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setLanguage('zh')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                settings.language === 'zh'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-accent-light)]'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                settings.language === 'en'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-accent-light)]'
              }`}
            >
              English
            </button>
          </div>
        </div>

        <ServerAISettings />


      </div>
    </div>
  );
}
