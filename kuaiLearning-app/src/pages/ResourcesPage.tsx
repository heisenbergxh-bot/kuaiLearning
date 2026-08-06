import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { Resource } from '../types';
import { db, generateId } from '../db';

export function ResourcesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [type, setType] = useState<'knowledge' | 'wisdom'>('knowledge');
  const [description, setDescription] = useState('');
  const { t } = useTranslation();


  const loadResources = useCallback(async () => {
    setLoading(true);
    const result = await db.resources.where('workspaceId').equals(workspaceId!).toArray();
    setResources(result.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void loadResources();
  }, [workspaceId, loadResources]);

  const handleCreate = async () => {
    if (!workspaceId || !title.trim() || !url.trim()) return;
    await db.resources.add({
      id: generateId(),
      workspaceId,
      title: title.trim(),
      url: url.trim(),
      type,
      description: description.trim(),
      createdAt: Date.now(),
    });
    setTitle('');
    setUrl('');
    setDescription('');
    setShowForm(false);
    await loadResources();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteResourceConfirm'))) {
      await db.resources.delete(id);
      await loadResources();
    }
  };

  const knowledge = resources.filter(r => r.type === 'knowledge');
  const wisdom = resources.filter(r => r.type === 'wisdom');

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  return (
    <div className="fade-in max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('resourcesTitle')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{t('resourcesDesc')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {showForm ? t('cancel') : t('addResource')}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-bg-card)] space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('resourceTitlePlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('resourceUrlPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="type"
                checked={type === 'knowledge'}
                onChange={() => setType('knowledge')}
                className="accent-[var(--color-accent)]"
              />
              {t('knowledge')}
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="radio"
                name="type"
                checked={type === 'wisdom'}
                onChange={() => setType('wisdom')}
                className="accent-[var(--color-accent)]"
              />
              {t('wisdom')}
            </label>
          </div>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('resourceDescPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 resize-none"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            {t('add')}
          </button>
        </div>
      )}

      {resources.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">🔗</p>
          <p className="text-[var(--color-text-muted)]">{t('noResourcesYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noResourcesHint')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {knowledge.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                {t('knowledgeSection')}
              </h3>
              <div className="space-y-2">
                {knowledge.map(r => (
                  <ResourceCard key={r.id} resource={r} onDelete={() => handleDelete(r.id)} />
                ))}
              </div>
            </div>
          )}
          {wisdom.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
                {t('wisdomSection')}
              </h3>
              <div className="space-y-2">
                {wisdom.map(r => (
                  <ResourceCard key={r.id} resource={r} onDelete={() => handleDelete(r.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceCard({ resource, onDelete }: { resource: Resource; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] group flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-[var(--color-accent)] hover:underline"
          >
            {resource.title}
          </a>
          {resource.sourceLessonNumber && (
            <span className="text-[10px] bg-[var(--color-accent-light)] text-[var(--color-accent)] px-1.5 py-0.5 rounded ml-2 whitespace-nowrap">
              {t('fromLesson')} #{String(resource.sourceLessonNumber).padStart(4, '0')}
            </span>
          )}
        </div>
        {resource.description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{resource.description}</p>
        )}
      </div>
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 px-1 ml-2 transition-opacity"
      >
        ×
      </button>
    </div>
  );
}
