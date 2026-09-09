import { useEffect, useState } from 'react';
import { readAISettings, saveAISettings } from '../api/aiSettings';
import type { ServerAISettings as Configuration } from '../api/aiSettings';
import { ApiError } from '../api/http';
import { useTranslation } from '../i18n/useTranslation';

const inputClass = 'w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] disabled:opacity-60';

export function ServerAISettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Configuration | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const [saved, setSaved] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    readAISettings().then(value => {
      if (!active) return;
      setConfig(value);
      setBaseUrl(value.base_url);
      setModel(value.model);
    }).catch(reason => {
      if (active) setError(reason instanceof ApiError ? reason.status : 0);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  async function save() {
    if (!config?.can_edit || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const value = await saveAISettings(baseUrl, model, apiKey);
      setConfig(value);
      setBaseUrl(value.base_url);
      setModel(value.model);
      setApiKey('');
      setSaved(true);
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0;
      setError(status);
      if (status === 403) setConfig(current => current && { ...current, can_edit: false });
    } finally {
      setSaving(false);
    }
  }

  const needsKey = config?.source !== 'database';
  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] p-4" aria-labelledby="server-ai-title">
      <h3 id="server-ai-title" className="font-semibold text-[var(--color-text-heading)]">{t('serverAiTitle')}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{t('serverAiDescription')}</p>
      {loading && <p role="status">{t('serverAiLoading')}</p>}
      {!loading && config && <>
        <p className="text-sm" role="status">{t(config.api_key_configured ? 'serverAiConfigured' : 'serverAiMissing')}</p>
        {!config.can_edit && <p className="text-sm text-[var(--color-text-muted)]">{t('serverAiReadOnly')}</p>}
        <form onSubmit={event => { event.preventDefault(); void save(); }}>
          <fieldset disabled={!config.can_edit || saving} className="space-y-3">
            <div>
              <label htmlFor="server-ai-url" className="block text-sm mb-1">{t('apiBaseLabel')}</label>
              <input id="server-ai-url" type="url" required maxLength={2048} className={inputClass} value={baseUrl}
                onChange={event => { setBaseUrl(event.target.value); setSaved(false); }} />
            </div>
            <div>
              <label htmlFor="server-ai-model" className="block text-sm mb-1">{t('modelLabel')}</label>
              <input id="server-ai-model" required maxLength={200} className={inputClass} value={model}
                onChange={event => { setModel(event.target.value); setSaved(false); }} />
            </div>
            {config.can_edit && <div>
              <label htmlFor="server-ai-key" className="block text-sm mb-1">{t('apiKeyLabel')}</label>
              <input id="server-ai-key" type="password" autoComplete="new-password" required={needsKey}
                className={inputClass} value={apiKey} aria-describedby="server-ai-key-hint"
                placeholder={t(needsKey ? 'apiKeyPlaceholder' : 'serverAiKeepKey')}
                onChange={event => { setApiKey(event.target.value); setSaved(false); }} />
              <p id="server-ai-key-hint" className="text-xs text-[var(--color-text-muted)] mt-1">
                {t(needsKey ? 'serverAiFirstKey' : 'serverAiKeepKey')}
              </p>
            </div>}
            {config.can_edit && <button type="submit"
              disabled={saving || !baseUrl.trim() || !model.trim() || (needsKey && !apiKey.trim())}
              className="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white disabled:opacity-50">
              {t(saving ? 'serverAiSaving' : 'serverAiSave')}
            </button>}
          </fieldset>
        </form>
      </>}
      {saved && <p role="status" className="text-sm text-[var(--color-success)]">{t('serverAiSaved')}</p>}
      {error !== null && <div role="alert" className="text-sm text-[var(--color-warning)]">
        {t(error === 403 ? 'serverAiForbidden' : error === 422 ? 'serverAiInvalid' : error === 503 ? 'serverAiUnavailable' : 'serverAiError')}
        {!config && <button type="button" className="ml-2 underline" onClick={() => setReload(value => value + 1)}>{t('serverAiRetry')}</button>}
      </div>}
    </section>
  );
}
