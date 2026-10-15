import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { ApiError } from '../api/http';
import { readEmbeddingSettings, saveEmbeddingSettings, testEmbeddingSettings } from '../api/embeddingSettings';
import type { EmbeddingConfiguration, EmbeddingSettingsInput } from '../api/embeddingSettings';

const inputClass = 'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text)] disabled:opacity-60';

export function ServerEmbeddingSettings() {
  const { lang } = useTranslation();
  const zh = lang === 'zh';
  const [config, setConfig] = useState<EmbeddingConfiguration | null>(null);
  const [provider, setProvider] = useState<'openai' | 'local'>('openai');
  const [url, setUrl] = useState('');
  const [model, setModel] = useState('');
  const [dimensions, setDimensions] = useState('1024');
  const [key, setKey] = useState('');
  const [noAuth, setNoAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'test' | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  function apply(value: EmbeddingConfiguration) {
    setConfig(value); setProvider(value.provider); setUrl(value.base_url);
    setModel(value.model); setDimensions(String(value.dimensions));
    setNoAuth(!value.api_key_configured); setKey('');
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    readEmbeddingSettings().then(value => { if (active) apply(value); })
      .catch(reason => { if (active) setError(reason instanceof ApiError ? reason.status : 0); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const endpointChanged = url.trim().replace(/\/$/, '') !== config?.base_url.replace(/\/$/, '');
  const requiresKey = provider === 'openai' && !noAuth && (!config?.api_key_configured || endpointChanged);
  const valid = !!model.trim() && !!url.trim() && Number.isInteger(Number(dimensions))
    && Number(dimensions) >= 32 && Number(dimensions) <= 4096 && (!requiresKey || !!key.trim());

  function changed() { setMessage(''); setError(null); }

  async function submit(action: 'save' | 'test') {
    if (!config?.can_edit || busy || !valid) return;
    const payload: EmbeddingSettingsInput = {
      provider, base_url: url.trim(), model: model.trim(), dimensions: Number(dimensions),
      ...(noAuth || provider === 'local' ? { clear_api_key: true } : key.trim() ? { api_key: key.trim() } : {}),
    };
    setBusy(action); setError(null); setMessage('');
    try {
      if (action === 'save') {
        apply(await saveEmbeddingSettings(payload));
        setMessage(zh ? '已保存，新请求立即使用此配置，无需重启。' : 'Saved. New requests use these settings without a restart.');
      } else {
        const result = await testEmbeddingSettings(payload);
        setMessage(zh ? `连接成功，返回 ${result.dimensions} 维向量。尚未保存配置。` : `Connected: ${result.dimensions} dimensions. Settings have not been saved.`);
      }
    } catch (reason) {
      const status = reason instanceof ApiError ? reason.status : 0;
      setError(status);
      if (status === 403) setConfig(current => current && { ...current, can_edit: false });
    } finally { setBusy(null); }
  }

  const errors: Record<number, string> = zh ? {
    403: '只有模型配置管理员可以修改。',
    409: '资料正在处理，或已有资料需要先迁移索引。请刷新配置后重试；同一模型的密钥可以单独更新。',
    422: '请检查接口地址、模型、维度和密钥。更换接口时需填写新密钥，或选择无需鉴权。',
    502: '连接测试失败，请检查接口、密钥、模型和输出维度。',
    503: '配置不可用，请管理员检查服务端密钥加密配置及模型安装情况。',
  } : {
    403: 'Only model configuration administrators can edit.',
    409: 'Processing is active or existing sources require index migration. Reload and retry. The same model can keep its index when rotating a key.',
    422: 'Check the URL, model, dimensions and key. A different endpoint needs a new key or no authentication.',
    502: 'Connection test failed. Check the endpoint, key, model and dimensions.',
    503: 'Settings unavailable. Check server encryption settings and local model installation.',
  };

  return (
    <section className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4" aria-labelledby="embedding-title">
      <h3 id="embedding-title" className="font-semibold text-[var(--color-text-heading)]">{zh ? '知识库 Embedding 模型' : 'Knowledge embedding model'}</h3>
      <p className="text-sm text-[var(--color-text-muted)]">{zh ? '将学习资料和问题转换为检索向量，与课程生成模型独立配置。外网和内网可使用各自的接口。' : 'Convert learning materials and questions into search vectors. Configure this separately from the course model for public or internal services.'}</p>
      {loading && <p role="status">{zh ? '正在读取配置…' : 'Loading settings…'}</p>}
      {!loading && config && <>
        <p className="text-xs text-[var(--color-text-muted)]">{zh ? (config.source === 'database' ? '使用已保存配置' : '使用服务器环境配置') : (config.source === 'database' ? 'Using saved settings' : 'Using server environment settings')} · {zh ? (config.api_key_configured ? '密钥已配置' : '未配置密钥') : (config.api_key_configured ? 'Key configured' : 'No key')}</p>
        {!config.can_edit && <p className="text-sm text-[var(--color-text-muted)]">{zh ? '当前账号仅可查看，管理员可修改配置。' : 'Read only. Administrators can update settings.'}</p>}
        <form onSubmit={event => { event.preventDefault(); void submit('save'); }}>
          <fieldset disabled={!config.can_edit || !!busy} className="space-y-3">
            <div><label htmlFor="embedding-provider" className="mb-1 block text-sm">{zh ? '运行方式' : 'Provider'}</label>
              <select id="embedding-provider" value={provider} className={inputClass} onChange={event => { setProvider(event.target.value as 'openai' | 'local'); changed(); }}>
                <option value="openai">{zh ? 'HTTP API（兼容 OpenAI）' : 'OpenAI-compatible HTTP API'}</option>
                <option value="local">{zh ? '本地 FastEmbed 模型' : 'Local FastEmbed model'}</option>
              </select></div>
            {provider === 'openai' ? <div><label htmlFor="embedding-url" className="mb-1 block text-sm">{zh ? '接口地址（Base URL）' : 'Base URL'}</label>
              <input id="embedding-url" type="url" required maxLength={2048} value={url} className={inputClass} onChange={event => { setUrl(event.target.value); changed(); }} />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{zh ? '填写接口前缀，例如 https://api.siliconflow.cn/v1 或内网地址；不包含 /embeddings。' : 'Include the API prefix (e.g. /v1), without /embeddings.'}</p></div>
              : <p className="text-xs text-[var(--color-text-muted)]">{zh ? '服务器需要安装本地模型依赖并准备模型缓存。' : 'The server needs local model dependencies and a prepared model cache.'}</p>}
            <div><label htmlFor="embedding-model" className="mb-1 block text-sm">{zh ? '模型名称' : 'Model'}</label>
              <input id="embedding-model" required maxLength={200} value={model} className={inputClass} onChange={event => { setModel(event.target.value); changed(); }} /></div>
            <div><label htmlFor="embedding-dimensions" className="mb-1 block text-sm">{zh ? '输出向量维度' : 'Output dimensions'}</label>
              <input id="embedding-dimensions" type="number" min={32} max={4096} step={1} required value={dimensions} className={inputClass} onChange={event => { setDimensions(event.target.value); changed(); }} />
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">{zh ? '填写模型实际输出维度，例如 BAAI/bge-m3 为 1024。' : 'Use the actual output size (e.g. 1024 for BAAI/bge-m3).'}</p></div>
            {config.can_edit && provider === 'openai' && <>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={noAuth} onChange={event => { setNoAuth(event.target.checked); setKey(''); changed(); }} />{zh ? '此接口无需密钥鉴权' : 'This endpoint needs no API key'}</label>
              {!noAuth && <div><label htmlFor="embedding-key" className="mb-1 block text-sm">API Key</label>
                <input id="embedding-key" type="password" autoComplete="new-password" required={requiresKey} value={key} className={inputClass} onChange={event => { setKey(event.target.value); changed(); }} placeholder={zh ? (requiresKey ? '填写此接口的密钥' : '留空保留当前密钥') : (requiresKey ? 'Enter the endpoint key' : 'Leave blank to keep the key')} />
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{zh ? '密钥仅在服务端加密保存，不回传浏览器。' : 'Keys are encrypted on the server and never returned to the browser.'}</p></div>}
            </>}
            {config.can_edit && <div className="flex flex-wrap gap-2"><button type="button" disabled={!valid} onClick={() => void submit('test')} className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-50">{busy === 'test' ? (zh ? '测试中…' : 'Testing…') : (zh ? '测试连接' : 'Test connection')}</button>
              <button type="submit" disabled={!valid} className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm text-white disabled:opacity-50">{busy === 'save' ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存 Embedding 配置' : 'Save embedding settings')}</button></div>}
          </fieldset>
        </form>
        {config.knowledge_source_count > 0 && <p className="text-xs text-[var(--color-warning)]">{zh ? `当前有 ${config.knowledge_source_count} 份资料。更换接口、模型或维度需要先迁移索引，系统会阻止直接切换。` : `${config.knowledge_source_count} sources exist. Changing the endpoint, model or dimensions requires index migration first.`}</p>}
      </>}
      {message && <p role="status" className="text-sm text-[var(--color-success)]">{message}</p>}
      {error !== null && <div role="alert" className="text-sm text-[var(--color-danger)]">{errors[error] || (zh ? '读取或保存失败，请重试。' : 'Request failed. Please retry.')}<button type="button" disabled={!!busy} onClick={() => { setReload(value => value + 1); setMessage(''); }} className="ml-2 underline">{zh ? '重新读取' : 'Reload'}</button></div>}
    </section>
  );
}
