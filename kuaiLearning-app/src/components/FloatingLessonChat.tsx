import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '../i18n/useTranslation';
import { AppIcon } from './AppIcon';
import { ChatPanel } from './ChatPanel';

export function FloatingLessonChat({ lessonId, lessonTitle }: { lessonId: string; lessonTitle: string }) {
  const { lang } = useTranslation();
  const [open, setOpen] = useState(false);
  const [viewport, setViewport] = useState({ height: window.innerHeight, inset: 0 });
  const launcher = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  function close() {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    const visual = window.visualViewport;
    const update = () => setViewport({
      height: visual?.height ?? window.innerHeight,
      inset: Math.max(0, window.innerHeight - ((visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight))),
    });
    update();
    window.addEventListener('resize', update);
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); setOpen(false);
        launcher.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  return createPortal(<>
    <div id={panelId} role="dialog" aria-label={lang === 'zh' ? '本课 AI 老师' : 'Lesson AI teacher'} aria-modal={false}
      className="fixed left-4 right-4 z-40 rounded-xl shadow-xl sm:left-auto sm:right-6 sm:w-[26rem]"
      style={{ display: open ? 'block' : 'none', bottom: `calc(${viewport.inset + 88}px + env(safe-area-inset-bottom))`, height: Math.min(560, Math.max(120, viewport.height - 112)) }}>
      {/* Preserve drafts and in-flight replies while minimized. */}
      <ChatPanel lessonId={lessonId} lessonTitle={lessonTitle} floating active={open} onClose={close} />
    </div>
    <button ref={launcher} type="button" onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls={panelId}
      aria-label={lang === 'zh' ? (open ? '收起 AI 老师' : '打开 AI 老师') : (open ? 'Minimize AI teacher' : 'Open AI teacher')}
      className="fixed right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--color-accent-border)] bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition-shadow hover:shadow-xl sm:right-6"
      style={{ bottom: `calc(${viewport.inset + 16}px + env(safe-area-inset-bottom))` }}>
      <AppIcon name={open ? 'close' : 'sparkles'} className="h-5 w-5" /><span>{lang === 'zh' ? 'AI 老师' : 'AI teacher'}</span>
    </button>
  </>, document.body);
}
