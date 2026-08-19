import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { QuizQuestion } from '../types';
import { db } from '../db';

type Mode = 'list' | 'practice';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ease-out cubic count-up for the results screen.
function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// Accuracy ring that draws itself on mount.
function AccuracyRing({ percent }: { percent: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const [offset, setOffset] = useState(C);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setOffset(C * (1 - percent / 100)),
    );
    return () => cancelAnimationFrame(id);
  }, [percent, C]);
  return (
    <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-border)" strokeWidth="9" />
      <circle
        cx="60" cy="60" r={R} fill="none"
        stroke={percent >= 60 ? 'var(--color-success)' : 'var(--color-warning)'}
        strokeWidth="9" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={offset}
        className="quiz-ring"
      />
    </svg>
  );
}

export function QuizBankPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { t } = useTranslation();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>('list');
  const [lessonFilter, setLessonFilter] = useState<number | 'all'>('all');

  // Practice state
  const [queue, setQueue] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    const result = await db.quizQuestions.where('workspaceId').equals(workspaceId!).toArray();
    setQuestions(result.sort((a, b) => a.lessonNumber - b.lessonNumber || a.createdAt - b.createdAt));
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void loadQuestions();
  }, [workspaceId, loadQuestions]);

  const lessonNumbers = Array.from(new Set(questions.map(q => q.lessonNumber))).sort((a, b) => a - b);
  const filtered = lessonFilter === 'all' ? questions : questions.filter(q => q.lessonNumber === lessonFilter);

  const totalAnswered = questions.reduce((s, q) => s + q.timesAnswered, 0);
  const totalCorrect = questions.reduce((s, q) => s + q.timesCorrect, 0);
  const overallAccuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : null;

  const startPractice = () => {
    if (filtered.length === 0) return;
    setQueue(shuffle(filtered));
    setIdx(0);
    setSelected(null);
    setSessionCorrect(0);
    setResults([]);
    setMode('practice');
  };

  const current = queue[idx];
  const finished = mode === 'practice' && idx >= queue.length;
  const finalPercent = queue.length > 0 ? Math.round((sessionCorrect / queue.length) * 100) : 0;
  const countUpCorrect = useCountUp(finished ? sessionCorrect : 0);
  const countUpTotal = useCountUp(finished ? queue.length : 0);

  const handleAnswer = useCallback(async (optionIdx: number) => {
    if (selected !== null || !current) return;
    setSelected(optionIdx);
    const correct = current.options[optionIdx]?.correct === true;
    if (correct) setSessionCorrect(s => s + 1);
    setResults(prev => [...prev, correct]);

    const updated: Partial<QuizQuestion> = {
      timesAnswered: current.timesAnswered + 1,
      timesCorrect: current.timesCorrect + (correct ? 1 : 0),
      lastAnsweredAt: Date.now(),
      lastCorrect: correct,
    };
    await db.quizQuestions.update(current.id, updated);
    // keep local in sync so list/stats reflect the attempt
    setQuestions(prev => prev.map(q => (q.id === current.id ? { ...q, ...updated } as QuizQuestion : q)));
  }, [selected, current]);

  const next = useCallback(() => {
    setSelected(null);
    setIdx(i => i + 1);
  }, []);

  // Keyboard shortcuts: 1-9 answer, Enter / ArrowRight advances.
  useEffect(() => {
    if (mode !== 'practice' || finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      if (selected === null) {
        const n = Number(e.key);
        if (n >= 1 && n <= current.options.length) {
          e.preventDefault();
          void handleAnswer(n - 1);
        }
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, finished, current, selected, handleAnswer, next]);

  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-[var(--color-text-muted)]">{t('loading')}</p>
      </div>
    );
  }

  // ---- Practice mode ----
  if (mode === 'practice') {
    return (
      <div className="fade-in max-w-2xl">
        <button
          onClick={() => { setMode('list'); loadQuestions(); }}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-4 inline-block"
        >
          {t('backToBank')}
        </button>

        {finished ? (
          <div className="text-center py-10 quiz-question-enter">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-6">
              {t('practiceDone')}
            </p>
            <div className="relative inline-flex items-center justify-center mb-6">
              <AccuracyRing percent={finalPercent} />
              <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
                <span className="text-3xl font-bold text-[var(--color-text-heading)] tabular-nums">
                  {finalPercent}%
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{t('accuracy')}</span>
              </div>
            </div>
            <p className="text-lg font-semibold text-[var(--color-text-heading)] mb-1 tabular-nums">
              {countUpCorrect} / {countUpTotal} {t('correct')}
            </p>
            {/* Per-question breakdown strip */}
            <div className="flex justify-center gap-1.5 my-5 flex-wrap">
              {results.map((r, i) => (
                <span
                  key={i}
                  title={`#${i + 1}`}
                  className={`w-3.5 h-3.5 rounded-full quiz-option-enter ${r ? 'bg-green-500' : 'bg-red-400'}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                />
              ))}
            </div>
            <button
              onClick={startPractice}
              className="px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all active:scale-95"
            >
              {t('restartPractice')}
            </button>
          </div>
        ) : current ? (
          <div>
            {/* Session progress: tick per question + animated fill */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                  {idx + 1} / {queue.length} · {t('fromLesson')} #{String(current.lessonNumber).padStart(4, '0')}
                </p>
                <p className="text-xs tabular-nums">
                  <span className="text-green-600 font-semibold">✓ {sessionCorrect}</span>
                  <span className="text-[var(--color-text-muted)] mx-1.5">·</span>
                  <span className="text-red-500 font-semibold">✗ {results.length - sessionCorrect}</span>
                </p>
              </div>
              <div className="flex gap-1">
                {queue.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                      i < results.length
                        ? results[i] ? 'bg-green-500' : 'bg-red-400'
                        : i === idx
                          ? 'bg-[var(--color-accent)]'
                          : 'bg-[var(--color-border)]'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Question card — keyed so each question animates in fresh */}
            <div key={idx} className="quiz-question-enter p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              <h3 className="font-semibold text-[var(--color-text-heading)] mb-4">{current.question}</h3>
              <div className="space-y-2">
                {current.options.map((opt, i) => {
                  const isAnswered = selected !== null;
                  const isCorrect = opt.correct;
                  const isPicked = selected === i;
                  let cls = 'border-[var(--color-border)] hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-light)]/40 hover:-translate-y-px';
                  let mark = '';
                  if (isAnswered && isCorrect) {
                    cls = `border-green-500 bg-green-500/10 ${isPicked ? 'quiz-pop' : ''}`;
                    mark = '✓';
                  } else if (isAnswered && isPicked && !isCorrect) {
                    cls = 'border-red-500 bg-red-500/10 quiz-shake';
                    mark = '✗';
                  } else if (isAnswered) {
                    cls = 'border-[var(--color-border)] opacity-60';
                  }
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={isAnswered}
                      style={{ animationDelay: `${i * 45}ms` }}
                      className={`quiz-option-enter w-full text-left px-4 py-2.5 rounded-lg border text-sm text-[var(--color-text)] transition-all active:scale-[0.98] flex items-center justify-between gap-3 ${cls} disabled:cursor-default disabled:active:scale-100`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <kbd className={`hidden sm:inline-flex shrink-0 items-center justify-center w-5 h-5 rounded border text-[10px] font-mono ${
                          isAnswered ? 'border-[var(--color-border)] text-[var(--color-text-muted)]' : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)]'
                        }`}>
                          {i + 1}
                        </kbd>
                        <span>{opt.text}</span>
                      </span>
                      {mark && (
                        <span className={`shrink-0 font-bold ${mark === '✓' ? 'text-green-600' : 'text-red-500'}`}>
                          {mark}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {selected !== null && (
                <div className={`quiz-feedback-enter mt-4 p-3 rounded-lg border ${
                  current.options[selected]?.correct
                    ? 'bg-green-500/10 border-green-500/40'
                    : 'bg-red-500/10 border-red-500/40'
                }`}>
                  <p className={`text-sm font-medium mb-1 ${
                    current.options[selected]?.correct ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {current.options[selected]?.correct ? `✓ ${t('answerCorrect')}` : `✗ ${t('answerWrong')}`}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap">
                    {current.options[selected]?.correct ? current.feedbackCorrect : current.feedbackWrong}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              {selected !== null && (
                <button
                  onClick={next}
                  autoFocus
                  className="quiz-feedback-enter px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all active:scale-95"
                >
                  {t('nextQuestion')} ⏎
                </button>
              )}
              <span className="hidden sm:inline text-[11px] text-[var(--color-text-muted)]">
                {t('quizKeyHint')}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  // ---- List / browse mode ----
  return (
    <div className="fade-in max-w-2xl">
      <h2 className="text-2xl font-bold text-[var(--color-text-heading)] mb-1">{t('quizBankTitle')}</h2>
      <p className="text-sm text-[var(--color-text-muted)] mb-6">{t('quizBankDesc')}</p>

      {questions.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-3xl mb-2">🧠</p>
          <p className="text-[var(--color-text-muted)] mb-1">{t('noQuizYet')}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{t('noQuizHint')}</p>
        </div>
      ) : (
        <>
          <div className="mb-6 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-[var(--color-text)]">
              <span className="font-semibold tabular-nums">{questions.length}</span> {t('questionsCount')}
              {overallAccuracy !== null && (
                <span className="ml-3 text-[var(--color-text-muted)]">
                  {t('accuracy')}: <span className="font-semibold text-[var(--color-text)] tabular-nums">{overallAccuracy}%</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={lessonFilter}
                onChange={e => setLessonFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="px-2.5 py-1.5 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none"
              >
                <option value="all">{t('allLessons')}</option>
                {lessonNumbers.map(n => (
                  <option key={n} value={n}>{t('fromLesson')} #{String(n).padStart(4, '0')}</option>
                ))}
              </select>
              <button
                onClick={startPractice}
                disabled={filtered.length === 0}
                className="px-4 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all active:scale-95 disabled:opacity-50"
              >
                {t('startPractice')}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map((q, qi) => {
              const acc = q.timesAnswered > 0 ? Math.round((q.timesCorrect / q.timesAnswered) * 100) : null;
              return (
                <div
                  key={q.id}
                  style={{ animationDelay: `${Math.min(qi, 10) * 35}ms` }}
                  className="quiz-list-item p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-[var(--color-accent-border)]"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-0.5 shrink-0">
                      #{String(q.lessonNumber).padStart(4, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text-heading)] font-medium">{q.question}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1 flex items-center gap-1.5">
                        {q.timesAnswered === 0 ? (
                          t('neverAnswered')
                        ) : (
                          <>
                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${q.lastCorrect ? 'bg-green-500' : 'bg-red-400'}`} />
                            {`${t('attempts')}: ${q.timesAnswered} · ${t('accuracy')}: ${acc}%`}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
