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
    setMode('practice');
  };

  const current = queue[idx];

  const handleAnswer = async (optionIdx: number) => {
    if (selected !== null || !current) return;
    setSelected(optionIdx);
    const correct = current.options[optionIdx]?.correct === true;
    if (correct) setSessionCorrect(s => s + 1);

    const updated: Partial<QuizQuestion> = {
      timesAnswered: current.timesAnswered + 1,
      timesCorrect: current.timesCorrect + (correct ? 1 : 0),
      lastAnsweredAt: Date.now(),
      lastCorrect: correct,
    };
    await db.quizQuestions.update(current.id, updated);
    // keep local in sync so list/stats reflect the attempt
    setQuestions(prev => prev.map(q => (q.id === current.id ? { ...q, ...updated } as QuizQuestion : q)));
  };

  const next = () => {
    setSelected(null);
    setIdx(i => i + 1);
  };

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
    const finished = idx >= queue.length;
    return (
      <div className="fade-in max-w-2xl">
        <button
          onClick={() => { setMode('list'); loadQuestions(); }}
          className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors mb-4 inline-block"
        >
          {t('backToBank')}
        </button>

        {finished ? (
          <div className="text-center py-12">
            <p className="text-3xl mb-3">🎉</p>
            <p className="text-lg font-semibold text-[var(--color-text-heading)] mb-1">{t('practiceDone')}</p>
            <p className="text-[var(--color-text-muted)] mb-6">
              {sessionCorrect} / {queue.length} {t('correct')}
              {queue.length > 0 && <span className="ml-1">({Math.round((sessionCorrect / queue.length) * 100)}%)</span>}
            </p>
            <button onClick={startPractice} className="px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              {t('restartPractice')}
            </button>
          </div>
        ) : current ? (
          <div>
            <p className="text-xs text-[var(--color-text-muted)] mb-3">
              {idx + 1} / {queue.length} · {t('fromLesson')} #{String(current.lessonNumber).padStart(4, '0')}
            </p>
            <div className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
              <h3 className="font-semibold text-[var(--color-text-heading)] mb-4">{current.question}</h3>
              <div className="space-y-2">
                {current.options.map((opt, i) => {
                  const isAnswered = selected !== null;
                  const isCorrect = opt.correct;
                  const isPicked = selected === i;
                  let cls = 'border-[var(--color-border)] hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-light)]/40';
                  if (isAnswered && isCorrect) cls = 'border-green-500 bg-green-500/10';
                  else if (isAnswered && isPicked && !isCorrect) cls = 'border-red-500 bg-red-500/10';
                  else if (isAnswered) cls = 'border-[var(--color-border)] opacity-60';
                  return (
                    <button
                      key={i}
                      onClick={() => handleAnswer(i)}
                      disabled={isAnswered}
                      className={`w-full text-left px-4 py-2.5 rounded-lg border text-sm text-[var(--color-text)] transition-all ${cls} disabled:cursor-default`}
                    >
                      {opt.text}
                    </button>
                  );
                })}
              </div>

              {selected !== null && (
                <div className="mt-4 p-3 rounded-lg bg-[var(--color-accent-light)]/40 border border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text-heading)] mb-1">
                    {current.options[selected]?.correct ? `✓ ${t('answerCorrect')}` : `✗ ${t('answerWrong')}`}
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] whitespace-pre-wrap">
                    {current.options[selected]?.correct ? current.feedbackCorrect : current.feedbackWrong}
                  </p>
                </div>
              )}
            </div>

            {selected !== null && (
              <button onClick={next} className="mt-4 px-5 py-2.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
                {t('nextQuestion')}
              </button>
            )}
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
              <span className="font-semibold">{questions.length}</span> {t('questionsCount')}
              {overallAccuracy !== null && (
                <span className="ml-3 text-[var(--color-text-muted)]">
                  {t('accuracy')}: <span className="font-semibold text-[var(--color-text)]">{overallAccuracy}%</span>
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
                className="px-4 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {t('startPractice')}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filtered.map(q => {
              const acc = q.timesAnswered > 0 ? Math.round((q.timesCorrect / q.timesAnswered) * 100) : null;
              return (
                <div key={q.id} className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)]">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-accent-light)] px-2 py-0.5 rounded mt-0.5 shrink-0">
                      #{String(q.lessonNumber).padStart(4, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text-heading)] font-medium">{q.question}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-1">
                        {q.timesAnswered === 0
                          ? t('neverAnswered')
                          : `${t('attempts')}: ${q.timesAnswered} · ${t('accuracy')}: ${acc}%`}
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
