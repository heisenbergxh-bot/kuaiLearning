import { useTranslation } from '../i18n/useTranslation';
import type { GlossaryTerm } from '../types';

interface GlossaryTermCardProps {
  term: GlossaryTerm;
  onDelete?: (id: string) => void;
}

// Reusable, prettier glossary term card — used on the global glossary page and
// on the lesson detail "术语表" tab so the look stays consistent.
export function GlossaryTermCard({ term, onDelete }: GlossaryTermCardProps) {
  const { t } = useTranslation();

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] pl-4 pr-3 py-3 transition-all hover:border-[var(--color-accent-border)] hover:shadow-sm">
      {/* accent spine */}
      <span className="absolute left-0 top-0 h-full w-1 bg-[var(--color-accent)]" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-[var(--color-text-heading)]">{term.term}</span>
            {term.category && (
              <span className="text-[10px] font-medium text-[var(--color-accent)] bg-[var(--color-accent-light)] border border-[var(--color-accent-border)] px-1.5 py-0.5 rounded-full">
                {term.category}
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed text-[var(--color-text)]">{term.definition}</p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(term.id)}
            className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 text-xs text-[var(--color-danger)] px-1 transition-opacity"
            aria-label={t('delete')}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
