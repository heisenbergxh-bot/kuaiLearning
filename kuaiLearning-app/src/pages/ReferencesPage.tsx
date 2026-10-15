import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { LessonRenderer } from '../components/LessonRenderer';
import { LibraryTools, LibraryNoResults } from '../components/LibraryTools';
import { matchesLibraryCourse, matchesLibrarySearch, referenceText } from '../lib/libraryView';
import { useTranslation } from '../i18n/useTranslation';
import type { Reference, Lesson } from '../types';
import { db } from '../db';

export function ReferencesPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [references, setReferences] = useState<Reference[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileReading, setMobileReading] = useState(false);
  const { t, lang } = useTranslation();
  const zh = lang === 'zh';
  const rendererWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setSelectedId(null); setMobileReading(false); setQuery(''); setCourse('all');
    if (workspaceId) void Promise.all([
      db.references.where('workspaceId').equals(workspaceId).toArray(),
      db.lessons.where('workspaceId').equals(workspaceId).toArray(),
    ]).then(([refs, courses]) => {
      if (!active) return;
      setReferences(refs.sort((a, b) => (a.sourceLessonNumber ?? 0) - (b.sourceLessonNumber ?? 0)));
      setLessons(courses); setLoading(false);
    });
    return () => { active = false; };
  }, [workspaceId]);

  const texts = useMemo(() => new Map(references.map(ref => [ref.id, referenceText(ref.htmlContent)])), [references]);
  const filtered = references.filter(ref => matchesLibraryCourse(course, ref.sourceLessonId)
    && matchesLibrarySearch(query, ref.title, texts.get(ref.id), lessons.find(lesson => lesson.id === ref.sourceLessonId)?.title));
  const selected = filtered.find(ref => ref.id === selectedId) || filtered[0];
  const source = lessons.find(lesson => lesson.id === selected?.sourceLessonId);
  function reset() { setQuery(''); setCourse('all'); setMobileReading(false); }

  if (loading) return <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">{t('loading')}</div>;

  return (
    <div className="fade-in max-w-5xl">
      <h2 className="mb-1 text-2xl font-bold text-[var(--color-text-heading)]">{zh ? '速查资料' : 'Quick references'}</h2>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">{zh ? '按课程查找速查资料，在目录中切换，随时回到来源课程。' : 'Find cheat-sheets by lesson, switch in the directory, and return to the source lesson.'}</p>
      {references.length === 0 ? <div className="py-12 text-center text-[var(--color-text-muted)]"><p>{t('noReferencesYet')}</p><p className="mt-1 text-sm">{t('noReferencesHint')}</p></div> : <>
        <LibraryTools query={query} onQuery={setQuery} course={course} onCourse={value => { setCourse(value); setMobileReading(false); }} lessons={lessons} sourceIds={references.map(ref => ref.sourceLessonId)} count={filtered.length} total={references.length} onReset={reset} />
        {!selected ? <LibraryNoResults onReset={reset} /> : <div className="grid items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label={zh ? '速查资料目录' : 'Reference directory'} className={`${mobileReading ? 'hidden lg:block' : ''} space-y-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto`}>
            {filtered.map(ref => <button key={ref.id} type="button" onClick={() => { setSelectedId(ref.id); setMobileReading(true); }} aria-current={selected.id === ref.id ? 'page' : undefined} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected.id === ref.id ? 'border-[var(--color-accent-border)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)] bg-[var(--color-bg-card)] hover:border-[var(--color-accent-border)]'}`}>
              <span className="mb-1 block text-[11px] text-[var(--color-text-muted)]">{ref.sourceLessonNumber != null ? `${zh ? '第' : 'Lesson '}${ref.sourceLessonNumber}${zh ? '课' : ''}` : (zh ? '速查资料' : 'Reference')}</span>
              <span className="block break-words text-sm font-medium text-[var(--color-text-heading)]">{ref.title}</span>
              <span className="mt-1 block line-clamp-2 text-xs leading-relaxed text-[var(--color-text-muted)]">{texts.get(ref.id)}</span>
            </button>)}
          </nav>
          <article className={`${mobileReading ? '' : 'hidden lg:block'} min-w-0`}>
            <button type="button" onClick={() => setMobileReading(false)} className="mb-3 text-sm text-[var(--color-accent)] lg:hidden">← {zh ? '返回目录' : 'Back to directory'}</button>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1"><h3 className="break-words text-xl font-semibold text-[var(--color-text-heading)]">{selected.title}</h3>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{new Date(selected.createdAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p>
                {source && <Link to={`/workspace/${workspaceId}/lesson/${source.id}`} className="mt-2 inline-block text-xs text-[var(--color-accent)] hover:underline">{zh ? '来源课程：' : 'Source lesson: '}{source.title} →</Link>}
              </div>
              <button type="button" onClick={() => rendererWrapperRef.current?.querySelector('iframe')?.contentWindow?.print()} className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-light)]">{t('print')}</button>
            </div>
            <div key={selected.id} ref={rendererWrapperRef} className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]"><LessonRenderer htmlContent={selected.htmlContent} fitContent /></div>
          </article>
        </div>}
      </>}
    </div>
  );
}
