import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { LearningRecord, Lesson } from '../types';
import { db, generateId } from '../db';
import { LibraryTools, LibraryNoResults } from '../components/LibraryTools';
import { localDayKey, matchesLibraryCourse, matchesLibrarySearch } from '../lib/libraryView';
import { LibrarySyncNotice } from '../components/LibrarySyncProvider';
import { useLibrarySync } from '../lib/librarySyncContext';

export function LearningRecordsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [evidence, setEvidence] = useState('');
  const [implications, setImplications] = useState('');
  const { t, lang } = useTranslation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [query, setQuery] = useState('');
  const [course, setCourse] = useState('all');
  const resetFilters = () => { setQuery(''); setCourse('all'); };
  const librarySync = useLibrarySync();


  const loadRecords = useCallback(async () => {
    const [result, courses] = await Promise.all([
      db.learningRecords.where('workspaceId').equals(workspaceId!).toArray(),
      db.lessons.where('workspaceId').equals(workspaceId!).toArray(),
    ]);
    setRecords(result.sort((a, b) => b.createdAt - a.createdAt || b.number - a.number));
    setLessons(courses);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    setQuery(''); setCourse('all'); setShowForm(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void loadRecords();
  }, [workspaceId, loadRecords, librarySync.revision]);

  const handleCreate = async () => {
    if (!workspaceId || !title.trim() || !content.trim()) return;

    const nums = records.map(r => r.number);
    const nextNum = nums.length > 0 ? Math.max(...nums) + 1 : 1;

    await db.learningRecords.add({
      id: generateId(),
      workspaceId,
      number: nextNum,
      title: title.trim(),
      content: content.trim(),
      status: 'active',
      evidence: evidence.trim() || undefined,
      implications: implications.trim() || undefined,
      createdAt: Date.now(),
    });

    setTitle('');
    setContent('');
    setEvidence('');
    setImplications('');
    setShowForm(false);
    resetFilters();
    await loadRecords();
    await librarySync.refresh();
  };

  const handleDelete = async (id: string) => {
    if (confirm(t('deleteRecordConfirm'))) {
      if (await librarySync.remove('records', id)) await loadRecords();
    }
  };

  const filtered = records.filter(record => matchesLibraryCourse(course, record.sourceLessonId)
    && matchesLibrarySearch(query, record.title, record.content, record.evidence, record.implications, lessons.find(lesson => lesson.id === record.sourceLessonId)?.title));
  const groups = filtered.reduce((result, record) => {
    (result[localDayKey(record.createdAt)] ||= []).push(record);
    return result;
  }, {} as Record<string, LearningRecord[]>);
  const today = localDayKey(Date.now());
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  function dayLabel(key: string, timestamp: number) {
    const date = new Date(timestamp).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const prefix = key === today ? (lang === 'zh' ? '今天' : 'Today') : key === localDayKey(yesterday.getTime()) ? (lang === 'zh' ? '昨天' : 'Yesterday') : '';
    return prefix ? `${prefix} · ${date}` : date;
  }

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
          <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('recordsTitle')}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{t('recordsDesc')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="shrink-0 whitespace-nowrap px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] transition-colors"
        >
          {showForm ? t('cancel') : t('addRecord')}
        </button>
      </div>

      {records.length > 0 && <LibraryTools query={query} onQuery={setQuery} course={course} onCourse={setCourse} lessons={lessons} sourceIds={records.map(record => record.sourceLessonId)} count={filtered.length} total={records.length} onReset={resetFilters} />}

      <LibrarySyncNotice />
      {showForm && (
        <div className="mb-6 p-4 rounded-xl border border-[var(--color-accent-border)] bg-[var(--color-bg-card)] space-y-3">
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('recordTitlePlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={t('recordContentPlaceholder')}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 resize-none"
          />
          <input
            type="text"
            value={evidence}
            onChange={e => setEvidence(e.target.value)}
            placeholder={t('evidencePlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <input
            type="text"
            value={implications}
            onChange={e => setImplications(e.target.value)}
            placeholder={t('implicationsPlaceholder')}
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
          />
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
          >
            {t('saveRecord')}
          </button>
        </div>
      )}

      {records.length === 0 && !showForm ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">📝</p>
          <p className="text-[var(--color-text-muted)]">{t('noRecordsYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noRecordsHint')}</p>
        </div>
      ) : records.length > 0 && filtered.length === 0 ? <LibraryNoResults onReset={resetFilters} /> : (
        <div className="space-y-7">
          {Object.entries(groups).map(([day, items]) => <section key={day} aria-label={dayLabel(day, items[0].createdAt)}>
            <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-heading)]">{dayLabel(day, items[0].createdAt)} <span className="ml-2 text-xs font-normal text-[var(--color-text-muted)]">{items.length} {lang === 'zh' ? '条记录' : 'records'}</span></h3>
            <div className="ml-2 space-y-3 border-l border-[var(--color-border)] pl-5">
              {items.map(record => {
                const source = lessons.find(lesson => lesson.id === record.sourceLessonId);
                return <article key={record.id} className="relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
                  <span aria-hidden="true" className="absolute -left-6 top-6 h-2 w-2 rounded-full bg-[var(--color-accent)]" />
                  <details className="group/record">
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-text-muted)]">
                        <span>{new Date(record.createdAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[var(--color-accent)]">{record.sourceLessonId ? (lang === 'zh' ? '课程学习总结' : 'Lesson summary') : (lang === 'zh' ? '手动记录' : 'Personal note')}</span>
                        <span>LR-{String(record.number).padStart(4, '0')}</span>
                        {record.status && record.status !== 'active' && <span className="text-[var(--color-warning)]">{record.status}</span>}
                      </div>
                      <h4 className="break-words font-semibold text-[var(--color-text-heading)]">{record.title}</h4>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text-muted)] group-open/record:hidden">{record.content}</p>
                      <span className="mt-2 block text-[11px] text-[var(--color-accent)]"><span className="group-open/record:hidden">{lang === 'zh' ? '展开完整记录 ↓' : 'Show full record ↓'}</span><span className="hidden group-open/record:inline">{lang === 'zh' ? '收起记录 ↑' : 'Hide record ↑'}</span></span>
                    </summary>
                    <div className="mt-4 space-y-4 border-t border-[var(--color-border)] pt-4">
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text)]">{record.content}</p>
                      {record.evidence && <div className="rounded-lg bg-[var(--color-bg-subtle)] p-3"><h5 className="mb-1 text-xs font-semibold text-[var(--color-text-heading)]">{t('evidence')}</h5><p className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">{record.evidence}</p></div>}
                      {record.implications && <div className="rounded-lg bg-[var(--color-accent-light)] p-3"><h5 className="mb-1 text-xs font-semibold text-[var(--color-text-heading)]">{t('implications')}</h5><p className="whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">{record.implications}</p></div>}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        {source && <Link to={`/workspace/${workspaceId}/lesson/${source.id}`} className="text-xs text-[var(--color-accent)] hover:underline">{lang === 'zh' ? '来源课程：' : 'Source lesson: '}{source.title} →</Link>}
                        <button type="button" onClick={() => handleDelete(record.id)} className="text-xs text-[var(--color-danger)]">{t('delete')}</button>
                      </div>
                    </div>
                  </details>
                </article>;
              })}
            </div>
          </section>)}
        </div>
      )}
    </div>
  );
}
