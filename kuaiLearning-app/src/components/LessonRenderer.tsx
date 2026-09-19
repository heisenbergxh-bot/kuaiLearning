import { useRef, useEffect, useCallback, useState } from 'react';

// Light, self-contained base styles injected into the lesson iframe. Provides
// defaults for the themed CSS variables the generation prompt references, plus
// readable body/table/quiz styling. Injected BEFORE the lesson's own <style>,
// so a lesson that defines its own theme still wins; one that only references
// the vars still renders correctly (and never inherits the app's dark theme).
const BASE_LESSON_CSS = `
:root{
  --bg:#ffffff; --bg-card:#faf9f7;
  --text:#374151; --text-heading:#111827; --text-muted:#6b7280;
  --border:#e5e7eb; --accent:#6366f1; --accent-light:#eef2ff; --accent-border:#c7d2fe;
  --success:#059669; --success-bg:#ecfdf5; --warning:#d97706; --warning-bg:#fffbeb;
  color-scheme: light;
}
html{ background:var(--bg); }
body{
  background:var(--bg); color:var(--text);
  font-family:'Inter',system-ui,-apple-system,sans-serif;
  font-size:16px; line-height:1.75;
  margin:0 auto; padding:1.5rem; max-width:44rem;
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3,h4{ color:var(--text-heading); line-height:1.3; letter-spacing:-0.01em; }
p,li{ color:var(--text); }
a{ color:var(--accent); text-underline-offset:2px; }
hr{ border:none; border-top:1px solid var(--border); margin:1.5rem 0; }
pre{ background:#1e1e2e; color:#cdd6f4; padding:1rem 1.25rem; border-radius:.5rem; overflow-x:auto; font-size:.875rem; line-height:1.6; }
pre code{ background:none; padding:0; color:inherit; }
:not(pre)>code{ font-family:ui-monospace,'JetBrains Mono',Consolas,monospace; font-size:.875em; background:var(--accent-light); padding:.125rem .375rem; border-radius:.25rem; }
table{ border-collapse:collapse; width:100%; margin:1rem 0; font-size:.9375rem; }
th,td{ border:1px solid var(--border); padding:.5rem .75rem; text-align:left; }
th{ background:var(--accent-light); color:var(--text-heading); }
blockquote{ border-left:3px solid var(--accent); margin:1rem 0; padding:.5rem 1rem; background:var(--accent-light); border-radius:0 .375rem .375rem 0; }
.callout,.example,.note,.tip,.warning{ border:1px solid var(--accent-border); background:var(--accent-light); padding:.75rem 1rem; border-radius:.5rem; margin:1rem 0; }
.warning{ border-color:var(--warning); background:var(--warning-bg); }
.quiz-block{ border:1px solid var(--border); border-radius:.75rem; padding:1.25rem; margin:1.5rem 0; background:var(--bg-card); }
.quiz-block .question{ font-weight:600; margin-bottom:.75rem; color:var(--text-heading); }
.quiz-block .option{ display:block; padding:.625rem .875rem; margin:.375rem 0; border:1px solid var(--border); border-radius:.5rem; cursor:pointer; transition:all .15s; }
.quiz-block .option:hover{ border-color:var(--accent-border); background:var(--accent-light); }
.quiz-block .option.correct{ border-color:var(--success); background:var(--success-bg); color:#065f46; }
.quiz-block .option.wrong{ border-color:#ef4444; background:#fef2f2; color:#991b1b; }
.quiz-block .feedback{ margin-top:.75rem; padding:.625rem .875rem; border-radius:.5rem; font-size:.9375rem; }
.quiz-block .feedback.correct{ background:var(--success-bg); color:var(--success); }
.quiz-block .feedback.wrong{ background:#fef2f2; color:#dc2626; }
`;

interface QuizState {
  selectedOption: number | null;
  answered: boolean;
}

interface LessonRendererProps {
  htmlContent: string;
  onQuizAnswer?: (quizId: string, correct: boolean) => void;
}

export function LessonRenderer({ htmlContent, onQuizAnswer }: LessonRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const onQuizAnswerRef = useRef(onQuizAnswer);
  const [height, setHeight] = useState(600);
  onQuizAnswerRef.current = onQuizAnswer;

  const setupQuizListeners = useCallback((doc: Document) => {
    const quizBlocks = doc.querySelectorAll<HTMLElement>('.quiz-block');
    const states = new Map<string, QuizState>();

    quizBlocks.forEach(block => {
      const quizId = block.getAttribute('data-quiz-id') || `quiz-${Math.random()}`;
      states.set(quizId, { selectedOption: null, answered: false });

      const options = block.querySelectorAll<HTMLElement>('.option');
      const feedbackCorrect = block.querySelector<HTMLElement>('.feedback.correct');
      const feedbackWrong = block.querySelector<HTMLElement>('.feedback.wrong');

      options.forEach((option, idx) => {
        option.addEventListener('click', () => {
          const state = states.get(quizId);
          if (!state || state.answered) return;

          state.answered = true;
          state.selectedOption = idx;

          const isCorrect = option.getAttribute('data-correct') === 'true';

          // Highlight all options
          options.forEach((opt, i) => {
            if (i === idx && isCorrect) {
              opt.classList.add('correct');
            } else if (i === idx && !isCorrect) {
              opt.classList.add('wrong');
            }
            // Also highlight the correct answer
            if (opt.getAttribute('data-correct') === 'true') {
              opt.classList.add('correct');
            }
          });

          // Show appropriate feedback
          if (isCorrect && feedbackCorrect) {
            feedbackCorrect.classList.add('show');
          } else if (!isCorrect && feedbackWrong) {
            feedbackWrong.classList.add('show');
          }

          onQuizAnswerRef.current?.(quizId, isCorrect);
        });
      });
    });
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Write content directly into the iframe document. We deliberately do NOT
    // wait for the iframe 'load' event: a src-less / about:blank iframe often
    // fires load before this effect runs, so the listener would never see it
    // and the iframe would stay blank. The contentDocument is available right
    // away for a same-origin iframe, so we write into it synchronously.
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(htmlContent || '<!DOCTYPE html><html><head></head><body></body></html>');
    doc.close();

    // Inject a light base stylesheet as the FIRST head child so it provides
    // sane defaults (themed CSS vars, body, tables, quiz blocks) that the
    // lesson's own <style> can still override. We do NOT copy the parent app
    // styles in — those carry a dark-mode html{} rule that turned lessons black.
    const baseStyle = doc.createElement('style');
    baseStyle.textContent = BASE_LESSON_CSS;
    doc.head.insertBefore(baseStyle, doc.head.firstChild);

    // Inject quiz hide/show rules LAST so they always take precedence.
    const quizStyle = doc.createElement('style');
    quizStyle.textContent = `
      .quiz-block .feedback { display: none !important; }
      .quiz-block .feedback.show { display: block !important; }
    `;
    doc.head.appendChild(quizStyle);

    // Setup quiz interactivity
    setupQuizListeners(doc);

    // Adjust iframe height to content
    const updateHeight = () => {
      const body = doc.body;
      const html = doc.documentElement;
      if (!body || !html) return;
      const h = Math.max(
        body.scrollHeight,
        body.offsetHeight,
        html.clientHeight,
        html.scrollHeight,
        html.offsetHeight,
      );
      setHeight(h + 40); // padding
    };

    updateHeight();
    // Re-measure after fonts/images settle.
    const t1 = setTimeout(updateHeight, 100);
    const t2 = setTimeout(updateHeight, 500);

    // Observe content changes
    const observer = doc.body ? new ResizeObserver(updateHeight) : null;
    if (doc.body && observer) observer.observe(doc.body);

    return () => {
      observer?.disconnect();
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [htmlContent, setupQuizListeners]);

  return (
    <iframe
      ref={iframeRef}
      title="Lesson Content"
      sandbox="allow-scripts allow-same-origin"
      className="w-full border-none bg-white rounded-lg"
      style={{ height: `${height}px`, minHeight: '400px' }}
    />
  );
}
