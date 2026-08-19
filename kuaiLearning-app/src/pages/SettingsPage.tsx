import { useSettingsStore } from '../stores/useSettingsStore';
import { useTranslation } from '../i18n/useTranslation';
import { LESSON_THEMES, DEFAULT_LESSON_THEME_ID } from '../lib/lessonThemes';

export function SettingsPage() {
  const { settings, setApiKey, setCustomBaseUrl, setModel, setLanguage, setLessonTheme } = useSettingsStore();
  const { t, lang } = useTranslation();
  const activeThemeId = settings.lessonTheme ?? DEFAULT_LESSON_THEME_ID;

  const fontTag = { serif: t('themeFontSerif'), sans: t('themeFontSans'), kai: t('themeFontKai') } as const;

  return (
    <div className="fade-in max-w-2xl">
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

        {/* Lesson document theme */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-text-heading)] mb-1">
            {t('themeLabel')}
          </label>
          <p className="text-xs text-[var(--color-text-muted)] mb-2.5">{t('themeHint')}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
            {LESSON_THEMES.map(theme => {
              const active = theme.id === activeThemeId;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => setLessonTheme(theme.id)}
                  className={`text-left rounded-lg border p-1.5 transition-all ${
                    active
                      ? 'border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-accent-border)]'
                  }`}
                >
                  {/* Mini document preview drawn with the theme's own palette */}
                  <div
                    className="h-14 rounded-md border p-2 flex flex-col justify-center gap-1.5"
                    style={{ background: theme.vars.bg, borderColor: theme.vars.border }}
                  >
                    <div className="h-1.5 w-3/5 rounded-full" style={{ background: theme.vars.textHeading }} />
                    <div className="h-1 w-4/5 rounded-full" style={{ background: theme.vars.textMuted }} />
                    <div className="h-1 w-2/3 rounded-full" style={{ background: theme.vars.textMuted, opacity: 0.6 }} />
                    <div className="h-1.5 w-1/4 rounded-full" style={{ background: theme.vars.accent }} />
                  </div>
                  <div className="flex items-center justify-between mt-1.5 px-0.5">
                    <span className={`text-xs font-medium truncate ${active ? 'text-[var(--color-accent)]' : 'text-[var(--color-text)]'}`}>
                      {theme.name[lang]}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 ml-1">
                      {fontTag[theme.font]}
                    </span>
                  </div>
                </button>
              );
            })}
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
