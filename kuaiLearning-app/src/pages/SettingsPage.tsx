import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { ServerAISettings } from '../components/ServerAISettings';
import { ThemeControl } from '../components/ThemeControl';

export function SettingsPage() {
  const { settings, setLanguage } = useSettingsStore();
  const { t, lang } = useTranslation();
  const themeLabels = {
    system: lang === 'zh' ? '跟随系统' : 'System',
    light: lang === 'zh' ? '浅色' : 'Light',
    dark: lang === 'zh' ? '深色' : 'Dark',
  };

  return (
    <div className="fade-in max-w-lg">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('settingsTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('settingsDesc')}</p>

      <div className="space-y-5">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
          <label className="block text-sm font-semibold text-[var(--color-text-heading)]">
            {lang === 'zh' ? '外观主题' : 'Appearance'}
          </label>
          <p className="mb-3 mt-1 text-xs text-[var(--color-text-muted)]">
            {lang === 'zh' ? '选择适合当前环境的界面颜色，设置会保存在本机。' : 'Choose a comfortable interface theme. This preference is saved on this device.'}
          </p>
          <ThemeControl labels={themeLabels} />
        </section>

        {/* Language */}
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5">
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
        </section>

        <ServerAISettings />


      </div>
    </div>
  );
}
