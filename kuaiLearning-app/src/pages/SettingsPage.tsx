import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';

export function SettingsPage() {
  const { settings, setApiKey, setCustomBaseUrl, setModel, setLanguage } = useSettingsStore();
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

        {/* API Key */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('apiKeyLabel')}
          </label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={t('apiKeyPlaceholder')}
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all font-mono text-sm"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {t('apiKeyHint')}:{' '}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
              OpenAI
            </a>
            {' '}|{' '}
            <a href="https://platform.deepseek.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
              DeepSeek
            </a>
          </p>
        </div>

        {/* API Base URL */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('apiBaseLabel')}
          </label>
          <input
            type="text"
            value={settings.apiBaseUrl}
            onChange={e => setCustomBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all text-sm"
          />
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1.5">
            {t('modelLabel')}
          </label>
          <input
            type="text"
            value={settings.model}
            onChange={e => setModel(e.target.value)}
            placeholder="gpt-4o"
            className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all text-sm"
          />
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {t('modelHint')}
          </p>
        </div>

        {/* Status */}
        <div className={`p-3 rounded-lg border text-sm ${
          settings.apiKey
            ? 'border-[var(--color-success)] bg-[var(--color-success-bg)] text-[var(--color-success)]'
            : 'border-[var(--color-warning)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]'
        }`}>
          {settings.apiKey ? t('apiReady') : t('apiNotSet')}
        </div>
      </div>
    </div>
  );
}
