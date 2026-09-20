import { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import type { SyllabusItem, Lesson } from '../types';
import { AppIcon } from './AppIcon';

type ItemStatus = 'planned' | 'generated' | 'completed';

interface SyllabusRoadmapProps {
  items: SyllabusItem[];
  lessons: Lesson[];
  busy: boolean;
  onGenerateSyllabus: () => void;
  onReplan: (guidance?: string) => void;
  onGenerateItem: (item: SyllabusItem) => void;
  onOpenLesson: (lessonId: string, tab: 'lesson' | 'reference' | 'glossary') => void;
}

export function SyllabusRoadmap({
  items, lessons, busy,
  onGenerateSyllabus, onReplan, onGenerateItem, onOpenLesson,
}: SyllabusRoadmapProps) {
  const { t } = useTranslation();
  const [replanOpen, setReplanOpen] = useState(false);
  const [replanText, setReplanText] = useState('');

  const submitReplan = () => {
    onReplan(replanText.trim() || undefined);
    setReplanText('');
    setReplanOpen(false);
  };

  const statusOf = (item: SyllabusItem): ItemStatus => {
    if (item.lessonId) {
      const lesson = lessons.find(l => l.id === item.lessonId);
      if (lesson?.completedAt) return 'completed';
      return 'generated';
    }
    return 'planned';
  };

  // Empty state — no syllabus yet.
  if (items.length === 0) {
    return (
      <div className="mb-6 rounded-2xl border border-dashed border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/30 p-6 text-center">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white"><AppIcon name="route" className="h-5 w-5" /></div>
        <p className="text-sm font-medium text-[var(--color-text-heading)] mb-1">{t('noSyllabusYet')}</p>
        <p className="text-xs text-[var(--color-text-muted)] mb-3">{t('noSyllabusHint')}</p>
        <button
          onClick={onGenerateSyllabus}
          disabled={busy}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? t('generatingSyllabus') : t('generateSyllabus')}
        </button>
      </div>
    );
  }

  const modules: string[] = [];
  for (const it of items) if (!modules.includes(it.module)) modules.push(it.module);

  const doneCount = items.filter(it => statusOf(it) === 'completed').length;

  const badge = (status: ItemStatus) => {
    if (status === 'completed') return <span className="shrink-0 text-[10px] font-medium text-[var(--color-success)] bg-[var(--color-success-bg)] border border-[var(--color-success-border)] px-1.5 py-0.5 rounded-full">✓ {t('statusCompleted')}</span>;
    if (status === 'generated') return <span className="shrink-0 text-[10px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-light)] border border-[var(--color-accent-border)] px-1.5 py-0.5 rounded-full">{t('statusGenerated')}</span>;
    return <span className="shrink-0 text-[10px] font-medium text-[var(--color-text-muted)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{t('statusPlanned')}</span>;
  };

  return (
    <div className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-5 shadow-sm">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-heading)]">{t('syllabusTitle')}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t('completedCount', { done: String(doneCount), total: String(items.length) })}
          </p>
        </div>
        <button
          onClick={() => setReplanOpen(o => !o)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] transition-colors disabled:opacity-50"
        >
          {t('replanSyllabus')}
        </button>
      </div>

      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-subtle)]" aria-label={t('completedCount', { done: String(doneCount), total: String(items.length) })}>
        <div className="h-full rounded-full bg-[var(--color-success)] transition-[width]" style={{ width: `${Math.round((doneCount / items.length) * 100)}%` }} />
      </div>

      {replanOpen && (
        <div className="mb-4 p-3 rounded-lg border border-[var(--color-accent-border)] bg-[var(--color-accent-light)]/30">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">{t('replanHint')}</p>
          <textarea
            value={replanText}
            onChange={e => setReplanText(e.target.value)}
            placeholder={t('replanPlaceholder')}
            rows={2}
            autoFocus
            className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent-border)] transition-all resize-none mb-2"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={submitReplan}
              disabled={busy}
              className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? t('generatingSyllabus') : t('replanConfirm')}
            </button>
            <button
              onClick={() => { setReplanOpen(false); setReplanText(''); }}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-border)] text-xs text-[var(--color-text)] hover:bg-[var(--color-accent-light)] transition-colors"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {modules.map((mod, mi) => (
          <div key={mod}>
            <div className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">
              {mi + 1}. {mod}
            </div>
            <div className="space-y-1.5">
              {items.filter(it => it.module === mod).map(it => {
                const status = statusOf(it);
                return (
                  <div key={it.id} className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 transition-colors hover:border-[var(--color-accent-border)] sm:flex-row sm:items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-[var(--color-text-heading)] font-medium">{it.title}</span>
                        {badge(status)}
                      </div>
                      {it.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{it.description}</p>}
                    </div>
                    {status === 'planned' ? (
                      <button
                        onClick={() => onGenerateItem(it)}
                        disabled={busy}
                        className="shrink-0 rounded-lg border border-[var(--color-accent-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-50"
                      >
                        {t('generateThisLesson')}
                      </button>
                    ) : (
                      <button
                        onClick={() => it.lessonId && onOpenLesson(it.lessonId, 'lesson')}
                        className="shrink-0 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-accent-light)]"
                      >
                        {t('viewLesson')}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
