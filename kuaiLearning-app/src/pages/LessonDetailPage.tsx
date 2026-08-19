import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { LessonRenderer } from '../components/LessonRenderer';
import { ChatPanel } from '../components/ChatPanel';
import { GlossaryTermCard } from '../components/GlossaryTermCard';
import { ThinkingBox, type ThinkingPhase } from '../components/ThinkingBox';
import { extractToc } from '../lib/extractToc';
import { LessonToc } from '../components/LessonToc';
import { getLessonTheme } from '../lib/lessonThemes';
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
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenText, setRegenText] = useState('');
  const [busy, setBusy] = useState(false);
  const [regenPhase, setRegenPhase] = useState<ThinkingPhase | null>(null);
  const [regenStream, setRegenStream] = useState('');
  const [regenError, setRegenError] = useState('');
  const [regenStartedAt, setRegenStartedAt] = useState<number | null>(null);
  const { t } = useTranslation();
  const refWrapperRef = useRef<HTMLDivElement>(null);

  // Table of contents (auto-generated from the lesson HTML headings)
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const toc = useMemo(() => extractToc(lesson?.htmlContent || ''), [lesson?.htmlContent]);
  const [activeToc, setActiveToc] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const lessonTheme = getLessonTheme(settings.lessonTheme);

  // The app scrolls inside <main>, not window — resolve it from the iframe.
  const getScrollContainer = useCallback(
    () => frameRef.current?.closest('main') ?? null,
    [],
  );

  // Heading position (px) inside the scroll container's content, or null.
  const headingTop = useCallback((id: string): number | null => {
    const iframe = frameRef.current;
    const container = getScrollContainer();
    const el = iframe?.contentDocument?.getElementById(id);
    if (!iframe || !container || !el) return null;
    // The iframe is sized to its full content height (no internal scroll), so a
    // heading's viewport position = iframe rect + element rect within the frame.
    return iframe.getBoundingClientRect().top + el.getBoundingClientRect().top
      - container.getBoundingClientRect().top + container.scrollTop;
  }, [getScrollContainer]);

  const scrollToHeading = useCallback((id: string) => {
    const container = getScrollContainer();
    const top = headingTop(id);
    if (!container || top == null) return;
    setActiveToc(id);
    container.scrollTo({ top: Math.max(0, top - 24), behavior: 'smooth' });
  }, [getScrollContainer, headingTop]);

  // Scroll-spy: highlight the last heading that has reached the reading line.
  useEffect(() => {
    if (tab !== 'lesson' || toc.length === 0) return;
    let raf = 0;
    const update = () => {
      let current: string | null = toc[0]?.id ?? null;
      for (const item of toc) {
        const top = headingTop(item.id);
        if (top == null) break;
        const container = getScrollContainer();
        if (!container) break;
        if (top - container.scrollTop <= 110) current = item.id;
        else break;
      }
      setActiveToc(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    const container = getScrollContainer();
    container?.addEventListener('scroll', onScroll, { passive: true });
    // Headings only get ids once the iframe content settles — measure shortly
    // after mount and again later to cover font/image reflow.
    const t1 = setTimeout(update, 150);
    const t2 = setTimeout(update, 600);
    return () => {
      container?.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [tab, toc, headingTop, getScrollContainer]);

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
    setRegenPhase('preparing');
    setRegenStream('');
    setRegenError('');
    setRegenStartedAt(Date.now());
    const guidance = regenText.trim() || undefined;
    const oldNumber = lesson.number;
    try {
      await deleteLessonCascade(lesson.id);
      const newLesson = await generateAndSaveLesson(settings, workspaceId, {
        targetItem: linkedItem || undefined,
        userRequest: guidance,
        reuseNumber: oldNumber,
        onChunk: (chunk) => {
          setRegenPhase('streaming');
          setRegenStream(prev => (prev + chunk).slice(-6000));
        },
      });
      setRegenOpen(false);
      setRegenText('');
      navigate(`/workspace/${workspaceId}/lesson/${newLesson.id}`, { replace: true });
    } catch (err: any) {
      setRegenError(err.message);
      setRegenPhase('error');
    } finally {
      setBusy(false);
    }
  };

  // Quiz feedback lives entirely inside the document (option styling + feedback
  // block). Here we only persist progress silently — the lessons list shows it.
  const handleQuizAnswer = async (_quizId: string, correct: boolean) => {
    if (!lessonId) return;
    const l = await db.lessons.get(lessonId);
    if (!l) return;
    await db.lessons.update(lessonId, {
      quizCorrect: (l.quizCorrect ?? 0) + (correct ? 1 : 0),
      quizTotal: (l.quizTotal ?? 0) + 1,
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
    <div className="fade-in">
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
          </div>
          {regenPhase && (
            <div className="mt-3">
              <ThinkingBox
                phase={regenPhase}
                title={t('thinkingLesson')}
                content={regenStream}
                errorText={regenError}
                startedAt={regenStartedAt}
              />
            </div>
          )}
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

          {/* TOC (mobile): collapsible panel above the lesson */}
          {toc.length > 1 && (
            <div className="lg:hidden mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] overflow-hidden">
              <button
                type="button"
                onClick={() => setTocOpen(o => !o)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-[var(--color-text-heading)]"
              >
                <span>{t('tocTitle')}</span>
                <svg viewBox="0 0 12 12" fill="none" className={`h-3.5 w-3.5 text-[var(--color-text-muted)] transition-transform duration-200 ${tocOpen ? 'rotate-180' : ''}`}>
                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {tocOpen && (
                <div className="border-t border-[var(--color-border)] px-2 py-2 max-h-64 overflow-y-auto">
                  <LessonToc items={toc} activeId={activeToc} onSelect={(id) => { scrollToHeading(id); setTocOpen(false); }} />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0 rounded-xl overflow-hidden border border-[var(--color-border)] shadow-sm">
              <LessonRenderer htmlContent={lesson.htmlContent} onQuizAnswer={handleQuizAnswer} frameRef={frameRef} theme={lessonTheme} />
            </div>

            {/* TOC (desktop): sticky right rail with scroll-spy */}
            {toc.length > 1 && (
              <aside className="hidden lg:block w-64 shrink-0 sticky top-6 max-h-[calc(100vh-4rem)] overflow-y-auto py-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 pl-3">
                  {t('tocTitle')}
                </p>
                <LessonToc items={toc} activeId={activeToc} onSelect={scrollToHeading} />
              </aside>
            )}
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
              <LessonRenderer htmlContent={reference.htmlContent} theme={lessonTheme} />
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
