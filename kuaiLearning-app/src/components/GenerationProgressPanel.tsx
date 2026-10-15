import { useEffect, useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { isGenerationActive } from '../lib/generationProgress';
import type { GenerationProgress, LessonGenerationPhase } from '../lib/generationProgress';

interface Props {
  progress: GenerationProgress;
  onOpen?: (lessonId: string) => void;
  onDismiss?: () => void;
}

export function GenerationProgressPanel({ progress, onOpen, onDismiss }: Props) {
  const { lang } = useTranslation();
  const zh = lang === 'zh';
  const active = isGenerationActive(progress.phase);
  const failed = progress.phase === 'error';
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, progress.startedAt]);
  const seconds = Math.max(0, Math.floor(((progress.endedAt ?? now) - progress.startedAt) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const labels: Record<LessonGenerationPhase, string> = zh ? {
    preparing: '正在准备课程与参考资料', waiting: '正在等待 AI 开始生成',
    generating: '正在编写课程内容', validating: '正在整理课程与配套练习',
    saving: '正在保存课程', syncing: '正在同步课程',
    done: '课程已生成', 'local-only': '课程已保存到当前浏览器', error: '本次生成未完成',
  } : {
    preparing: 'Preparing the lesson and sources', waiting: 'Waiting for AI to begin',
    generating: 'Writing the lesson', validating: 'Organizing the lesson and exercises',
    saving: 'Saving the lesson', syncing: 'Syncing the lesson',
    done: 'Lesson ready', 'local-only': 'Lesson saved in this browser', error: 'Generation did not finish',
  };
  const step = { preparing: 0, waiting: 1, generating: 1, validating: 2,
    saving: 3, syncing: 3, done: 4, 'local-only': 4, error: -1 }[progress.phase];
  const steps = zh ? ['准备资料', '编写课程', '整理练习', '保存课程']
    : ['Prepare', 'Write', 'Organize', 'Save'];
  const description = failed ? progress.error : progress.phase === 'local-only'
    ? (zh ? '云端同步暂未完成，可以先阅读；稍后会重试同步。' : 'Cloud sync is pending. You can read now and sync later.')
    : active ? (seconds >= 60
      ? (zh ? '内容较长，生成仍在进行中。请保持页面打开，避免重复生成。' : 'Longer lessons take time. Keep this page open and avoid starting again.')
      : (zh ? '课程和配套练习会一起生成，请保持页面打开。' : 'The lesson and exercises are generated together. Keep this page open.'))
    : (zh ? '课程和配套内容已准备好，可以开始学习。' : 'Your lesson and supporting content are ready.');

  return (
    <section className={`sticky top-3 z-20 mb-5 rounded-2xl border bg-[var(--color-bg-card)] p-4 shadow-sm sm:p-5 ${failed ? 'border-[var(--color-danger-border)]' : 'border-[var(--color-accent-border)]'}`} aria-busy={active}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)]" aria-hidden="true">
          {active ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" /> : <span>{failed ? '!' : '✓'}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--color-text-heading)]" role="status" aria-live="polite">{labels[progress.phase]}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]" title={progress.title}>{progress.title}</p>
        </div>
        {!active && onDismiss && <button onClick={onDismiss} className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" aria-label={zh ? '关闭生成提示' : 'Dismiss generation status'}>×</button>}
      </div>
      {!failed && <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={zh ? '课程生成步骤' : 'Lesson generation steps'}>
        {steps.map((label, index) => (
          <li key={label} aria-current={index === step ? 'step' : undefined} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${index <= step ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'bg-[var(--color-bg-subtle)] text-[var(--color-text-muted)]'}`}>
            <span aria-hidden="true">{index < step ? '✓' : index + 1}</span><span>{label}</span>
          </li>
        ))}
      </ol>}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--color-text-muted)]">
        <span>{zh ? '已用时' : 'Elapsed'} {elapsed}</span>
        {progress.characters > 0 && <span>{zh ? '已接收' : 'Received'} {progress.characters.toLocaleString()} {zh ? '字' : 'characters'}</span>}
      </div>
      <p className={`mt-2 break-words text-xs ${failed ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]'}`} role={failed ? 'alert' : undefined}>{description}</p>
      {!active && !failed && progress.lessonId && onOpen && <button onClick={() => onOpen(progress.lessonId!)} className="mt-3 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-medium text-white hover:opacity-90">{zh ? '查看课程' : 'Open lesson'} →</button>}
    </section>
  );
}
