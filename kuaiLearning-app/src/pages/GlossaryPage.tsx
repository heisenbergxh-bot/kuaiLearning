import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import { GlossaryTermCard } from '../components/GlossaryTermCard';
import type { GlossaryTerm } from '../types';
import { db, generateId } from '../db';

export function GlossaryPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [avoidRaw, setAvoidRaw] = useState('');
  const [category, setCategory] = useState('');
  const { t } = useTranslation();


  const loadTerms = useCallback(async () => {
    setLoading(true);
    const result = await db.glossaryTerms.where('workspaceId').equals(workspaceId!).toArray();
    setTerms(result.sort((a, b) => a.term.localeCompare(b.term)));
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void loadTerms();
  }, [workspaceId, loadTerms]);

  const handleCreate = async () => {
    if (!workspaceId || !term.trim() || !definition.trim()) return;
    await db.glossaryTerms.add({
      id: generateId(),
      workspaceId,
      term: term.trim(),
      definition: definition.trim(),
      avoid: avoidRaw.split(',').map(s => s.trim()).filter(Boolean),
      category: category.trim() || undefined,
      createdAt: Date.now(),
    });
    setTerm('');
    setDefinition('');
    setAvoidRaw('');
    setCategory('');
    setShowForm(false);
    await loadTerms();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteTermConfirm'))) {
      await db.glossaryTerms.delete(id);
      await loadTerms();
    }
  };

  const grouped = terms.reduce((acc, t) => {
    const key = t.category || 'Uncategorized';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, GlossaryTerm[]>);

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
          <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('glossaryTitle')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{t('glossaryDesc')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {showForm ? t('cancel') : t('addTerm')}
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-bg-card)] space-y-3">
          <input
            type="text"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder={t('termPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <textarea
            value={definition}
            onChange={e => setDefinition(e.target.value)}
            placeholder={t('defPlaceholder')}
            rows={2}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 resize-none"
          />
          <input
            type="text"
            value={avoidRaw}
            onChange={e => setAvoidRaw(e.target.value)}
            placeholder={t('avoidPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <input
            type="text"
            value={category}
            onChange={e => setCategory(e.target.value)}
            placeholder={t('categoryPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            {t('add')}
          </button>
        </div>
      )}

      {terms.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📚</p>
          <p className="text-[var(--color-text-muted)]">{t('noGlossaryYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noGlossaryHint')}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, catTerms]) => (
            <div key={cat}>
              {Object.keys(grouped).length > 1 && (
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                    {cat === 'Uncategorized' ? t('uncategorized') : cat}
                  </h3>
                  <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-1.5 py-0.5 rounded-full">
                    {catTerms.length}
                  </span>
                  <div className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
              )}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {catTerms.map(gt => (
                  <GlossaryTermCard key={gt.id} term={gt} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
