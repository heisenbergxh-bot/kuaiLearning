import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { AppIcon } from '../components/AppIcon';

export function ResourcesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const processingCount = sources.filter(source => source.status === 'pending' || source.status === 'processing').length;
  const failedCount = sources.filter(source => source.status === 'failed').length;
  const onboarding = searchParams.get('onboarding') === '1';
  const uploadErrors = Number(searchParams.get('uploadErrors') || 0);
  const knowledge = resources.filter(resource => resource.type === 'knowledge');
  const wisdom = resources.filter(resource => resource.type === 'wisdom');
  if (loading) return <Loading />;

  return (
    <div className="fade-in max-w-4xl space-y-8">
      {onboarding && (
        <section className="rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/30 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-heading)]">
                {processingCount > 0
                  ? (lang === 'zh' ? '工作区已创建，正在准备学习资料' : 'Workspace created — preparing materials')
                  : (lang === 'zh' ? '学习资料已经准备好' : 'Learning materials are ready')}
              </h2>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {processingCount > 0
                  ? (lang === 'zh' ? `还有 ${processingCount} 份资料正在解析，完成后再生成学习路线，课程会更贴合原文。` : `${processingCount} material(s) are still processing. Generate the roadmap after they are ready.`)
                  : (lang === 'zh' ? `已有 ${readyCount} 份资料可用于学习路线、课时生成和答疑。` : `${readyCount} material(s) can now ground the roadmap, lessons, and chat.`)}
              </p>
              {(uploadErrors > 0 || failedCount > 0) && <p className="mt-1 text-xs text-[var(--color-danger)]">{lang === 'zh' ? `${uploadErrors + failedCount} 份资料未成功处理，可在下方重试或重新上传。` : `${uploadErrors + failedCount} material(s) need attention.`}</p>}
            </div>
            <button
              onClick={() => navigate(`/workspace/${workspaceId}/lessons`)}
              disabled={processingCount > 0 || readyCount === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppIcon name="route" className="h-4 w-4" />
              {lang === 'zh' ? '下一步：生成学习路线' : 'Next: generate roadmap'}
            </button>
          </div>
        </section>
      )}
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{lang === 'zh' ? '我的资料库' : 'My knowledge library'}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{lang === 'zh' ? '上传后，AI 会在规划课程、生成课程和答疑时自动检索并引用原文。' : 'Uploaded sources are retrieved and cited during planning, lessons, and chat.'}</p>
          </div>
          <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
            <AppIcon name="upload" className="h-4 w-4" />{uploading ? (lang === 'zh' ? '上传中…' : 'Uploading…') : (lang === 'zh' ? '上传资料' : 'Upload source')}
            <input ref={fileRef} type="file" accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void handleUpload(file); }} />
          </label>
        </div>

        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-3">
            <span>{lang === 'zh' ? '支持 PDF / TXT / Markdown，单文件最大 200MB' : 'PDF / TXT / Markdown, up to 200MB'}</span>
            {readyCount > 0 && <span>· {readyCount} {lang === 'zh' ? '份可用资料' : 'ready'}</span>}
          </div>
          {sources.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--color-text-muted)]"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-bg-subtle)]"><AppIcon name="file" className="h-5 w-5" /></div>{lang === 'zh' ? '还没有上传资料' : 'No uploaded sources yet'}</div>
          ) : (
            <div className="space-y-2">{sources.map(source => <SourceCard key={source.id} source={source} workspaceId={workspaceId!} lang={lang} onRefresh={loadResources} onError={setMessage} />)}</div>
          )}
        </div>

        {readyCount > 0 && (
          <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void handleSearch(); }} placeholder={lang === 'zh' ? '试着搜索资料中的内容…' : 'Search inside your sources…'} className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30" />
              <button onClick={() => void handleSearch()} disabled={searching || query.trim().length < 2} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--color-accent-border)] px-4 py-2 text-sm text-[var(--color-accent)] disabled:opacity-50"><AppIcon name="search" className="h-4 w-4" />{searching ? (lang === 'zh' ? '检索中…' : 'Searching…') : (lang === 'zh' ? '检索测试' : 'Test search')}</button>
            </div>
            {hits.length > 0 && <div className="mt-4 space-y-3">{hits.map((hit, index) => <div key={hit.chunk_id} className="text-sm border-l-2 border-[var(--color-accent-border)] pl-3"><div className="font-medium text-[var(--color-text-heading)]">{index + 1}. {hit.source_title}{hit.page_number ? ` · ${lang === 'zh' ? '第' : 'p.'}${hit.page_number}${lang === 'zh' ? '页' : ''}` : ''}</div><p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)] line-clamp-4">{hit.content}</p></div>)}</div>}
          </div>
        )}
        {message && <p className="mt-3 text-sm text-[var(--color-danger)]">{message}</p>}
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
  const sourceTypeText: Record<string, string> = lang === 'zh'
    ? { core: '核心教材', supplementary: '补充资料', exam: '题库/考试', notes: '个人笔记', document: '学习资料' }
    : { core: 'Core material', supplementary: 'Supplementary', exam: 'Exam material', notes: 'Personal notes', document: 'Learning material' };
  const run = async (action: () => Promise<unknown>) => { try { await action(); await onRefresh(); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } };
  return <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent-light)] text-[var(--color-accent)]"><AppIcon name="file" className="h-4 w-4" /></span>
    <div className="min-w-0 flex-1">
      <a href={`/api/v1/workspaces/${workspaceId}/knowledge/sources/${source.id}/download`} className="text-sm font-semibold text-[var(--color-text-heading)] hover:text-[var(--color-accent)]" target="_blank" rel="noreferrer">{source.title}</a>
      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[var(--color-text-muted)]"><span className="rounded bg-[var(--color-accent-light)] px-1.5 py-0.5 text-[var(--color-accent)]">{sourceTypeText[source.source_type] || source.source_type}</span><span>{formatBytes(source.byte_size)}</span><span>·</span><span className={source.status === 'failed' ? 'text-[var(--color-danger)]' : source.status === 'ready' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>{statusText[source.status] || source.status}</span>{source.status === 'ready' && <><span>·</span><span>{source.chunk_count} {lang === 'zh' ? '个片段' : 'chunks'}</span></>}</div>
      {source.error_message && <p className="text-xs text-[var(--color-danger)] mt-1">{source.error_message}</p>}
    </div>
    <div className="flex shrink-0 gap-1">{source.status === 'failed' && <button className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-light)]" onClick={() => void run(() => retryKnowledgeSource(workspaceId, source.id))}><AppIcon name="refresh" className="h-3.5 w-3.5" />{lang === 'zh' ? '重试' : 'Retry'}</button>}<button className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-danger)] hover:bg-[var(--color-danger-bg)]" aria-label={lang === 'zh' ? '删除资料' : 'Delete source'} onClick={() => { if (confirm(lang === 'zh' ? '确定删除这份资料？' : 'Delete this source?')) void run(() => deleteKnowledgeSource(workspaceId, source.id)); }}><AppIcon name="trash" className="h-3.5 w-3.5" /></button></div>
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
  return <div className="group flex items-start justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-3"><div className="min-w-0 flex-1"><div className="flex items-center"><a href={resource.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--color-accent)] hover:underline">{resource.title}</a>{resource.sourceLessonNumber && <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">{t('fromLesson')} #{String(resource.sourceLessonNumber).padStart(4, '0')}</span>}</div>{resource.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{resource.description}</p>}</div><button onClick={onDelete} aria-label={t('delete')} className="ml-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-danger)] opacity-100 transition-all hover:bg-[var(--color-danger-bg)] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><AppIcon name="trash" className="h-3.5 w-3.5" /></button></div>;
}
