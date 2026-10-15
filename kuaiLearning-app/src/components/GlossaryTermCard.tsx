import { Link } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';
import type { GlossaryTerm } from '../types';

interface GlossaryTermCardProps {
  term: GlossaryTerm;
  onDelete?: (id: string) => void;
  compact?: boolean;
  sourceHref?: string;
  sourceLabel?: string;
}

export function GlossaryTermCard({ term, onDelete, compact = false, sourceHref, sourceLabel }: GlossaryTermCardProps) {
  const { t, lang } = useTranslation();
  const avoid = term.avoid || [];
  const title = <div className="flex flex-wrap items-center gap-2 pr-5"><span className="font-semibold text-[var(--color-text-heading)]">{term.term}</span>{term.category && <span className="rounded-full bg-[var(--color-accent-light)] px-2 py-0.5 text-[10px] text-[var(--color-accent)]">{term.category}</span>}</div>;
  const definition = <div className="mt-3 space-y-3">
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text)]">{term.definition}</p>
    {avoid.length > 0 && <div className="rounded-lg bg-[var(--color-warning-bg)] p-3 text-xs text-[var(--color-warning)]"><p className="mb-1 font-medium">{lang === 'zh' ? '易混淆说法 / 应避免' : 'Confusing wording / avoid'}</p><ul className="list-disc space-y-1 pl-4">{avoid.map((item, index) => <li key={index} className="break-words">{item}</li>)}</ul></div>}
    {sourceHref && <Link to={sourceHref} className="inline-block text-xs text-[var(--color-accent)] hover:underline">{lang === 'zh' ? '来源课程：' : 'Source lesson: '}{sourceLabel} →</Link>}
  </div>;
  return <div className="group relative rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 hover:border-[var(--color-accent-border)]">
    {compact ? <details className="group/term"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{title}<p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-[var(--color-text-muted)] group-open/term:hidden">{term.definition}</p><span className="mt-2 block text-[11px] text-[var(--color-accent)]"><span className="group-open/term:hidden">{lang === 'zh' ? '展开详情 ↓' : 'Show details ↓'}</span><span className="hidden group-open/term:inline">{lang === 'zh' ? '收起详情 ↑' : 'Hide details ↑'}</span></span></summary>{definition}</details> : <>{title}{definition}</>}
    {onDelete && <button type="button" onClick={() => onDelete(term.id)} className="absolute right-2 top-3 rounded px-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-danger)]" aria-label={`${t('delete')} ${term.term}`}>×</button>}
  </div>;
}
