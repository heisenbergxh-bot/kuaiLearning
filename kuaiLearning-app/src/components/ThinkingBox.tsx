import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';

export type ThinkingPhase = 'preparing' | 'streaming' | 'done' | 'error';

interface ThinkingBoxProps {
  phase: ThinkingPhase;
  /** Header label while active, e.g. "AI 正在撰写课程内容" */
  title: string;
  /** Accumulated raw stream text (caller should cap its length) */
  content?: string;
  /** Error message shown when phase === 'error' */
  errorText?: string;
  /** Epoch ms when generation started — drives the elapsed timer */
  startedAt?: number | null;
}

// Mainstream "thinking" panel: shimmer header + pulsing orb while active,
// collapsible raw-stream body with auto-scroll, elapsed timer, done/error states.
export function ThinkingBox({ phase, title, content, errorText, startedAt }: ThinkingBoxProps) {
  const { t } = useTranslation();
  const active = phase === 'preparing' || phase === 'streaming';

  const [expanded, setExpanded] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevPhase = useRef(phase);

  // Auto-expand while working, auto-collapse on success, force-open on error.
  useEffect(() => {
    if (active) setExpanded(true);
    if (phase === 'done' && prevPhase.current !== 'done') setExpanded(false);
    if (phase === 'error') setExpanded(true);
    prevPhase.current = phase;
  }, [phase, active]);

  // Elapsed timer (keeps its final value once the phase leaves "active").
  useEffect(() => {
    if (!active || !startedAt) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [active, startedAt]);

  // Keep the stream pinned to the bottom while it grows.
  useEffect(() => {
    if (expanded && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, expanded]);

  const hasBody = phase === 'error' ? !!errorText : !!content;

  const headerLabel =
    phase === 'done' ? t('thinkingDone')
    : phase === 'error' ? t('genError')
    : title;

  return (
    <div
      className={`rounded-xl border bg-[var(--color-bg-card)] overflow-hidden fade-in ${
        phase === 'error' ? 'border-[var(--color-warning)]' : 'border-[var(--color-border)]'
      }`}
    >
      <button
        type="button"
        onClick={() => hasBody && setExpanded(e => !e)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left ${hasBody ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {/* Status icon */}
        {active ? (
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className="thinking-orb-ring absolute inline-flex h-full w-full rounded-full bg-[var(--color-accent)]" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-[var(--color-accent)]" />
          </span>
        ) : phase === 'done' ? (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]">
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none">
              <path d="M2 5.2L4.2 7.2L8 3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning)] text-[10px] font-bold text-white">
            !
          </span>
        )}

        {/* Label */}
        <span className={`text-sm font-medium ${active ? 'thinking-shimmer-text' : 'text-[var(--color-text-heading)]'}`}>
          {headerLabel}
        </span>
        {active && (
          <span className="thinking-dots text-sm font-medium text-[var(--color-text-muted)]" aria-hidden>
            <span>.</span><span>.</span><span>.</span>
          </span>
        )}

        <span className="flex-1" />

        {/* Elapsed time */}
        {(active || phase === 'done') && elapsed > 0 && (
          <span className="text-xs font-mono text-[var(--color-text-muted)] tabular-nums">
            {t('thinkingElapsed', { s: String(elapsed) })}
          </span>
        )}

        {/* Chevron */}
        {hasBody && (
          <svg
            viewBox="0 0 12 12"
            fill="none"
            className={`h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)] transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Collapsible body: raw stream / error detail */}
      {expanded && hasBody && (
        <div
          ref={bodyRef}
          className="max-h-52 overflow-y-auto border-t border-[var(--color-border)] px-4 py-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-[var(--color-text-muted)]"
        >
          {phase === 'error' ? errorText : content}
          {active && content && <span className="thinking-cursor text-[var(--color-accent)]">▍</span>}
        </div>
      )}
    </div>
  );
}
