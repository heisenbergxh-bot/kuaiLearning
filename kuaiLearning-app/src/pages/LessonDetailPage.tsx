import { useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { LessonRenderer } from '../components/LessonRenderer';
import { ChatPanel } from '../components/ChatPanel';
import { GlossaryTermCard } from '../components/GlossaryTermCard';
import { useTranslation } from '../i18n/useTranslation';
import { useSettingsStore } from '../stores/useSettingsStore';
import { generateAndSaveLesson, deleteLessonCascade } from '../lib/lessonGen';
import type { Lesson, Reference, GlossaryTerm, SyllabusItem } from '../types';
import { db } from '../db';

type Tab = 'lesson' | 'reference' | 'glossary';

export function LessonDetailPage() {
  const { workspaceId, lessonId } = useParams<{ workspaceId: string; lessonId: string }>();
  const navigate = useNavigate();
  const { settings } = useSettingsStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as Tab) || 'lesson';
  const setTab = (next: Tab) => setSearchParams({ tab: next }, { replace: true });

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [terms, setTerms] = useState<GlossaryTerm[]>([]);
  const [linkedItem, setLinkedItem] = useState<SyllabusItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [quizResults, setQuizResults] = useState<{ correct: number; total: number }>({ correct: 0, total: 0 });
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenText, setRegenText] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyStatus, setBusyStatus] = useState('');
  const { t } = useTranslation();
  const refWrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lessonId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  const load = async () => {
    setLoading(true);
    const result = await db.lessons.get(lessonId!);
    setLesson(result || null);

    if (result) {
      const ref = await db.references.where('sourceLessonId').equals(result.id).first();
      setReference(ref || null);
      const allTerms = await db.glossaryTerms.where('workspaceId').equals(result.workspaceId).toArray();
      setTerms(allTerms.filter(gt => gt.sourceLessonId === result.id));
      const items = await db.syllabusItems.where('workspaceId').equals(result.workspaceId).toArray();
      setLinkedItem(items.find(s => s.lessonId === result.id) || null);
      await db.lessons.update(result.id, { lastViewedAt: Date.now() });
    }
    setLoading(false);
  };

  const handleRegenerate = async () => {
    if (!lesson || !workspaceId || !settings.apiKey || busy) return;
    setBusy(true);
    setBusyStatus(t('genPreparing'));
    const guidance = regenText.trim() || undefined;
    const oldNumber = lesson.number;
    try {
      await deleteLessonCascade(lesson.id);
      const newLesson = await generateAndSaveLesson(settings, workspaceId, {
        targetItem: linkedItem || undefined,
        userRequest: guidance,
        reuseNumber: oldNumber,
        onChunk: (chunk) => setBusyStatus(prev => prev.length > 80 ? t('genGenerating') : prev + chunk.slice(0, 30)),
      });
      setRegenOpen(false);
      setRegenText('');
      navigate(`/workspace/${workspaceId}/lesson/${newLesson.id}`, { replace: true });
    } catch (err: any) {
      setBusyStatus(`${t('error')}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleQuizAnswer = (_quizId: string, correct: boolean) => {
    setQuizResults(prev => {
      const next = {
        correct: prev.correct + (correct ? 1 : 0),
        total: prev.total + 1,
      };
      if (lessonId) {
        db.lessons.update(lessonId, { quizCorrect: next.correct, quizTotal: next.total });
      }
      return next;
    });
  };

  const handleMarkComplete = async () => {
    if (!lesson) return;
    const completedAt = Date.now();
    await db.lessons.update(lesson.id, { completedAt });
    setLesson({ ...lesson, completedAt });
  };

  const handlePrintReference = () => {
    const iframe = refWrapperRef.current?.querySelector('iframe');
    iframe?.contentWindow?.print();
  };

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-[var(--color-text-muted)]">{t('loading')}</p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="text-center py-16">
        <p className="text-[var(--color-text-muted)]">{t('lessonNotFound')}</p>
        <Link to={`/workspace/${workspaceId}/lessons`} className="text-[var(--color-accent)] text-sm mt-2 inline-block hover:underline">
          {t('backToLessons')}
        </Link>
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'lesson', label: t('tabLessonContent') },
    { key: 'reference', label: t('references') },
    { key: 'glossary', label: t('glossary') },
  ];

  return (
    <div className="fade-in max-w-3xl">
      <div className="mb-4">
        <Link
          to={`/workspace/${workspaceId}/lessons`}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors inline-flex items-center gap-1 mb-3"
        >
          {t('backToLessons')}
        </Link>
        <div className="flex items-start gap-3">
          <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-1.5">
            #{String(lesson.number).padStart(4, '0')}
          </span>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-[var(--color-text-heading)]">{lesson.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {t('created')} {new Date(lesson.createdAt).toLocaleDateString()}
            </p>
          </div>
          {lesson.completedAt ? (
            <span className="mt-1.5 shrink-0 inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-500/10 border border-green-500/30 px-2.5 py-1 rounded-full">
              ✓ {t('completed')}
            </span>
          ) : (
            <button
              onClick={handleMarkComplete}
              className="mt-1.5 shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-accent-border)] text-[var(--color-accent)] hover:bg-[var(--color-accent-light)] transition-colors"
            >
              {t('markComplete')}
            </button>
          )}
        </div>
      </div>

      {/* Lesson actions: regenerate / delete */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setRegenOpen(o => !o)}
          disabled={busy || !settings.apiKey}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-accent-light)] transition-colors disabled:opacity-50"
        >
          ↻ {t('regenerate')}
        </button>
        {!settings.apiKey && <span className="text-xs text-[var(--color-warning)]">{t('genNoApiKey')}</span>}
      </div>

      {regenOpen && (
        <div className="mb-5 p-3 rounded-lg border border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/30">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('regenerateHint')}</p>
          <textarea
            value={regenText}
            onChange={e => setRegenText(e.target.value)}
            placeholder={t('regeneratePlaceholder')}
            rows={2}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all resize-none mb-2"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleRegenerate}
              disabled={busy}
              className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? t('regenerating') : t('regenerateConfirm')}
            </button>
            <button
              onClick={() => { setRegenOpen(false); setRegenText(''); }}
              disabled={busy}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] transition-colors disabled:opacity-50"
            >
              {t('cancel')}
            </button>
            {busyStatus && <span className="text-xs text-[var(--color-text-muted)] font-mono truncate">{busyStatus}</span>}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-5 border-b border-[var(--color-border)]">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`px-3.5 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              tab === tb.key
                ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
            }`}
          >
            {tb.label}
            {tb.key === 'glossary' && terms.length > 0 && (
              <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-1.5 py-0.5 rounded-full">
                {terms.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lesson tab */}
      {tab === 'lesson' && (
        <>
          {quizResults.total > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--color-accent-light)] border border-[var(--color-accent-border)]">
              <p className="text-sm font-medium text-[var(--color-text-heading)]">
                {t('quizProgress')}: {quizResults.correct}/{quizResults.total} {t('correct')}
                <span className="ml-2 text-[var(--color-text-muted)]">
                  ({Math.round((quizResults.correct / quizResults.total) * 100)}%)
                </span>
              </p>
            </div>
          )}

          {lesson.primarySource && (
            <div className="mb-4 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-semibold mb-0.5">
                {t('primarySource')}
              </p>
              <a
                href={lesson.primarySource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[var(--color-accent)] hover:underline font-medium"
              >
                {lesson.primarySource.title}
              </a>
            </div>
          )}

          <div className="rounded-xl overflow-hidden border border-[var(--color-border)] shadow-sm">
            <LessonRenderer htmlContent={lesson.htmlContent} onQuizAnswer={handleQuizAnswer} />
          </div>

          <div className="mt-6">
            <ChatPanel lessonId={lesson.id} />
          </div>
        </>
      )}

      {/* Reference tab */}
      {tab === 'reference' && (
        reference ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[var(--color-text-heading)]">{reference.title}</h3>
              <button
                onClick={handlePrintReference}
                className="px-3 py-1.5 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent-border)] transition-colors whitespace-nowrap"
              >
                {t('print')}
              </button>
            </div>
            <div ref={refWrapperRef} className="rounded-xl overflow-hidden border border-[var(--color-border)] shadow-sm">
              <LessonRenderer htmlContent={reference.htmlContent} />
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">📄</p>
            <p className="text-[var(--color-text-muted)]">{t('lessonReferenceEmpty')}</p>
          </div>
        )
      )}

      {/* Glossary tab */}
      {tab === 'glossary' && (
        terms.length > 0 ? (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {terms.map(gt => <GlossaryTermCard key={gt.id} term={gt} />)}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-3xl mb-2">📚</p>
            <p className="text-[var(--color-text-muted)]">{t('lessonTermsEmpty')}</p>
          </div>
        )
      )}
    </div>
  );
}
