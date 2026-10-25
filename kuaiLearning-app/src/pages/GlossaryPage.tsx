import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import { GlossaryTermCard } from '../components/GlossaryTermCard';
import type { GlossaryTerm, Lesson } from '../types';
import { db, generateId } from '../db';
import { LibraryTools, LibraryNoResults, libraryInputClass } from '../components/LibraryTools';
import { matchesLibraryCourse, matchesLibrarySearch } from '../lib/libraryView';
import { LibrarySyncNotice } from '../components/LibrarySyncProvider';
import { useLibrarySync } from '../lib/librarySyncContext';

export function GlossaryPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [term, setTerm] = useState('');
  const [definition, setDefinition] = useState('');
  const [avoidRaw, setAvoidRaw] = useState('');
  const [category, setCategory] = useState('');
  const { t, lang } = useTranslation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const resetFilters = () => { setQuery(''); setCourse('all'); setCategoryFilter('all'); };
  const librarySync = useLibrarySync();


  const loadTerms = useCallback(async () => {
    const [result, courses] = await Promise.all([
      db.glossaryTerms.where('workspaceId').equals(workspaceId!).toArray(),
      db.lessons.where('workspaceId').equals(workspaceId!).toArray(),
    ]);
    setTerms(result.sort((a, b) => a.term.localeCompare(b.term)));
    setLessons(courses);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    setQuery(''); setCourse('all'); setCategoryFilter('all'); setShowForm(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void loadTerms();
  }, [workspaceId, loadTerms, librarySync.revision]);

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
    resetFilters();
    await loadTerms();
    await librarySync.refresh();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteTermConfirm'))) {
      if (await librarySync.remove('glossary', id)) await loadTerms();
    }
  };

  const filtered = terms.filter(term => matchesLibraryCourse(course, term.sourceLessonId)
    && (categoryFilter === 'all' || (categoryFilter === 'uncategorized' && !term.category) || categoryFilter === `category:${term.category}`)
    && matchesLibrarySearch(query, term.term, term.definition, term.category, (term.avoid || []).join(' '), lessons.find(lesson => lesson.id === term.sourceLessonId)?.title));
  const grouped = filtered.reduce((acc, t) => {
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
    <div className="fade-in max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('glossaryTitle')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{t('glossaryDesc')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="shrink-0 whitespace-nowrap px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {showForm ? t('cancel') : t('addTerm')}
        </button>
      </div>

      <LibrarySyncNotice />
      {terms.length > 0 && <>
        <LibraryTools query={query} onQuery={setQuery} course={course} onCourse={setCourse} lessons={lessons} sourceIds={terms.map(term => term.sourceLessonId)} count={filtered.length} total={terms.length} onReset={resetFilters} />
        <div className="mb-5 flex flex-wrap items-center gap-2"><label htmlFor="glossary-category" className="text-xs text-[var(--color-text-muted)]">{lang === 'zh' ? '术语分类' : 'Category'}</label>
          <select id="glossary-category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className={`${libraryInputClass} max-w-52`}><option value="all">{lang === 'zh' ? '全部分类' : 'All categories'}</option>
            {terms.some(term => !term.category) && <option value="uncategorized">{t('uncategorized')}</option>}
            {[...new Set(terms.map(term => term.category).filter((category): category is string => !!category))].sort().map(category => <option key={category} value={`category:${category}`}>{category}</option>)}
          </select>
          <span className="text-xs text-[var(--color-text-muted)]">{lang === 'zh' ? '点击术语展开完整定义与易混淆说法' : 'Expand a term for its definition and confusing wording'}</span>
        </div>
      </>}

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
      ) : terms.length > 0 && filtered.length === 0 ? <LibraryNoResults onReset={resetFilters} /> : (
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
              <div className="space-y-2">
                {catTerms.map(gt => {
                  const source = lessons.find(lesson => lesson.id === gt.sourceLessonId);
                  return <GlossaryTermCard key={gt.id} term={gt} compact onDelete={handleDelete} sourceHref={source ? `/workspace/${workspaceId}/lesson/${source.id}` : undefined} sourceLabel={source?.title} />;
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
