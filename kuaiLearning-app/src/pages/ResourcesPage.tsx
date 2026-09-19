import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  deleteKnowledgeSource,
  listKnowledgeSources,
  retryKnowledgeSource,
  searchKnowledge,
  uploadKnowledgeSource,
  type KnowledgeSearchHit,
  type KnowledgeSource,
} from '../api/knowledge';
import { db, generateId } from '../db';
import { useTranslation } from '../i18n/useTranslation';
import type { Resource } from '../types';

export function ResourcesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [resources, setResources] = useState<Resource[]>([]);
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'knowledge' | 'wisdom'>('knowledge');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<KnowledgeSearchHit[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { t, lang } = useTranslation();

  const loadResources = useCallback(async () => {
    if (!workspaceId) return;
    const [localResources, remoteSources] = await Promise.all([
      db.resources.where('workspaceId').equals(workspaceId).toArray(),
      listKnowledgeSources(workspaceId),
    ]);
    setResources(localResources.sort((a, b) => b.createdAt - a.createdAt));
    setSources(remoteSources);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    void loadResources().catch(error => {
      setMessage(error instanceof Error ? error.message : String(error));
      setLoading(false);
    });
  }, [loadResources]);

  useEffect(() => {
    if (!sources.some(source => source.status === 'pending' || source.status === 'processing')) return;
    const timer = window.setInterval(() => void loadResources(), 3000);
    return () => window.clearInterval(timer);
  }, [sources, loadResources]);

  const handleUpload = async (file: File) => {
    if (!workspaceId) return;
    setUploading(true); setMessage('');
    try {
      await uploadKnowledgeSource(workspaceId, file);
      await loadResources();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSearch = async () => {
    if (!workspaceId || query.trim().length < 2) return;
    setSearching(true); setMessage('');
    try { setHits(await searchKnowledge(workspaceId, query.trim(), 8)); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSearching(false); }
  };

  const handleCreate = async () => {
    if (!workspaceId || !title.trim() || !url.trim()) return;
    await db.resources.add({
      id: generateId(), workspaceId, title: title.trim(), url: url.trim(), type,
      description: description.trim(), createdAt: Date.now(),
    });
    setTitle(''); setUrl(''); setDescription(''); setShowForm(false);
    await loadResources();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteResourceConfirm'))) {
      await db.resources.delete(id);
      await loadResources();
    }
  };

  const readyCount = sources.filter(source => source.status === 'ready').length;
  const knowledge = resources.filter(resource => resource.type === 'knowledge');
  const wisdom = resources.filter(resource => resource.type === 'wisdom');
  if (loading) return <Loading />;

  return (
    <div className="fade-in max-w-3xl space-y-8">
      <section>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{lang === 'zh' ? '我的资料库' : 'My knowledge library'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'zh' ? '上传后，AI 会在规划课程、生成课程和答疑时自动检索并引用原文。' : 'Uploaded sources are retrieved and cited during planning, lessons, and chat.'}</p>
          </div>
          <label className={`px-4 py-2 rounded-lg text-sm font-medium bg-[var(--color-accent)] text-white cursor-pointer hover:opacity-90 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading ? (lang === 'zh' ? '上传中…' : 'Uploading…') : (lang === 'zh' ? '上传资料' : 'Upload source')}
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void handleUpload(file); }} />
          </label>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-3">
            <span>{lang === 'zh' ? '支持 PDF / TXT / Markdown，单文件最大 200MB' : 'PDF / TXT / Markdown, up to 200MB'}</span>
            {readyCount > 0 && <span>· {readyCount} {lang === 'zh' ? '份可用资料' : 'ready'}</span>}
          </div>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--color-text-muted)]"><div className="text-3xl mb-2">📚</div>{lang === 'zh' ? '还没有上传资料' : 'No uploaded sources yet'}</div>
          ) : (
            <div className="space-y-2">{sources.map(source => <SourceCard key={source.id} source={source} workspaceId={workspaceId!} lang={lang} onRefresh={loadResources} onError={setMessage} />)}</div>
          )}
        </div>

        {readyCount > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex gap-2">
              <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSearch(); }} placeholder={lang === 'zh' ? '试着搜索资料中的内容…' : 'Search inside your sources…'} className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30" />
              <button onClick={() => void handleSearch()} disabled={searching || query.trim().length < 2} className="px-4 py-2 text-sm rounded-lg border border-[var(--color-accent-border)] text-[var(--color-accent)] disabled:opacity-50">{searching ? (lang === 'zh' ? '检索中…' : 'Searching…') : (lang === 'zh' ? '检索测试' : 'Test search')}</button>
            </div>
            {hits.length > 0 && <div className="mt-4 space-y-3">{hits.map((hit, index) => <div key={hit.chunk_id} className="text-sm border-l-2 border-[var(--color-accent-border)] pl-3"><div className="font-medium text-[var(--color-text-heading)]">{index + 1}. {hit.source_title}{hit.page_number ? ` · ${lang === 'zh' ? '第' : 'p.'}${hit.page_number}${lang === 'zh' ? '页' : ''}` : ''}</div><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)] line-clamp-4">{hit.content}</p></div>)}</div>}
          </div>
        )}
        {message && <p className="mt-3 text-sm text-red-500">{message}</p>}
      </section>

      <section>
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="text-xl font-bold text-[var(--color-text-heading)]">{t('resourcesTitle')}</h2><p className="text-sm text-[var(--color-text-muted)]">{t('resourcesDesc')}</p></div>
          <button onClick={() => setShowForm(!showForm)} className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)]">{showForm ? t('cancel') : t('addResource')}</button>
        </div>
        {showForm && <div className="mb-6 p-4 rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-bg-card)] space-y-3">
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder={t('resourceTitlePlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
          <input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder={t('resourceUrlPlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]" />
          <div className="flex gap-3">{(['knowledge', 'wisdom'] as const).map(value => <label key={value} className="flex items-center gap-1.5 text-sm"><input type="radio" checked={type === value} onChange={() => setType(value)} className="accent-[var(--color-accent)]" />{t(value)}</label>)}</div>
          <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder={t('resourceDescPlaceholder')} rows={2} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] resize-none" />
          <button onClick={() => void handleCreate()} className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium">{t('add')}</button>
        </div>}
        {knowledge.length > 0 && <ResourceSection title={t('knowledgeSection')} resources={knowledge} onDelete={handleDelete} />}
        {wisdom.length > 0 && <ResourceSection title={t('wisdomSection')} resources={wisdom} onDelete={handleDelete} />}
      </section>
    </div>
  );
}

function Loading() {
  return <div className="text-center py-16"><div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto" /></div>;
}

function SourceCard({ source, workspaceId, lang, onRefresh, onError }: { source: KnowledgeSource; workspaceId: string; lang: 'zh' | 'en'; onRefresh: () => Promise<void>; onError: (message: string) => void }) {
  const statusText: Record<string, string> = { pending: lang === 'zh' ? '等待解析' : 'Pending', processing: lang === 'zh' ? '解析与索引中' : 'Processing', ready: lang === 'zh' ? '可使用' : 'Ready', failed: lang === 'zh' ? '处理失败' : 'Failed' };
  const run = async (action: () => Promise<unknown>) => { try { await action(); await onRefresh(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } };
  return <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] flex gap-3 items-start">
    <span className="text-xl">{source.original_filename.toLowerCase().endsWith('.pdf') ? '📕' : '📄'}</span>
    <div className="min-w-0 flex-1">
      <a href={`/api/v1/workspaces/${workspaceId}/knowledge/sources/${source.id}/download`} className="text-sm font-semibold text-[var(--color-text-heading)] hover:text-[var(--color-accent)]" target="_blank" rel="noreferrer">{source.title}</a>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]"><span>{formatBytes(source.byte_size)}</span><span>·</span><span className={source.status === 'failed' ? 'text-red-500' : source.status === 'ready' ? 'text-green-600' : 'text-amber-600'}>{statusText[source.status] || source.status}</span>{source.status === 'ready' && <><span>·</span><span>{source.chunk_count} {lang === 'zh' ? '个片段' : 'chunks'}</span></>}</div>
      {source.error_message && <p className="text-xs text-red-500 mt-1">{source.error_message}</p>}
    </div>
    <div className="flex gap-2 text-xs">{source.status === 'failed' && <button className="text-[var(--color-accent)]" onClick={() => void run(() => retryKnowledgeSource(workspaceId, source.id))}>{lang === 'zh' ? '重试' : 'Retry'}</button>}<button className="text-red-400" onClick={() => { if (confirm(lang === 'zh' ? '确定删除这份资料？' : 'Delete this source?')) void run(() => deleteKnowledgeSource(workspaceId, source.id)); }}>×</button></div>
  </div>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ResourceSection({ title, resources, onDelete }: { title: string; resources: Resource[]; onDelete: (id: string) => Promise<void> }) {
  return <div className="mb-5"><h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">{title}</h3><div className="space-y-2">{resources.map(resource => <ResourceCard key={resource.id} resource={resource} onDelete={() => void onDelete(resource.id)} />)}</div></div>;
}

function ResourceCard({ resource, onDelete }: { resource: Resource; onDelete: () => void }) {
  const { t } = useTranslation();
  return <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] group flex items-start justify-between"><div className="min-w-0 flex-1"><div className="flex items-center"><a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--color-accent)] hover:underline">{resource.title}</a>{resource.sourceLessonNumber && <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">{t('fromLesson')} #{String(resource.sourceLessonNumber).padStart(4, '0')}</span>}</div>{resource.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{resource.description}</p>}</div><button onClick={onDelete} className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-1 ml-2 transition-opacity">×</button></div>;
}
