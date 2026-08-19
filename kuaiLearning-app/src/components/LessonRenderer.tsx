import { useRef, useEffect, useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { TOC_HEADING_SELECTOR, tocHeadingId } from '../lib/extractToc';
import { FONT_STACKS, THEME_FONT_IMPORT, type LessonTheme } from '../lib/lessonThemes';

// Build the scholarly-literary base stylesheet for the selected theme.
// Injected BEFORE the lesson's own <style>, so a lesson that defines its own
// theme still wins; one that only references the vars renders in this world.
function buildBaseCss(theme: LessonTheme): string {
  const v = theme.vars;
  const font = FONT_STACKS[theme.font];
  return `
${THEME_FONT_IMPORT}
:root{
  --bg:${v.bg}; --bg-card:${v.bgCard};
  --text:${v.text}; --text-heading:${v.textHeading}; --text-muted:${v.textMuted};
  --border:${v.border}; --accent:${v.accent}; --accent-light:${v.accentLight}; --accent-border:${v.accentBorder};
  --success:#3f7a52; --success-bg:#edf3ec; --warning:#9a6a1b; --warning-bg:#f8f0dd;
  color-scheme: light;
}
html{ background:var(--bg); }
body{
  background:var(--bg); color:var(--text);
  font-family:${font};
  font-size:17px; line-height:1.9; letter-spacing:.01em;
  margin:0 auto; padding:2.5rem 2rem; max-width:46rem;
  -webkit-font-smoothing:antialiased;
  counter-reset:section;
}
h1,h2,h3,h4{ color:var(--text-heading); line-height:1.35; font-weight:600; }
h1{ font-size:clamp(1.6rem,1.35rem+1vw,2rem); letter-spacing:.02em; margin:0 0 .75rem; }
h2{ font-size:1.3rem; margin:2.75rem 0 .75rem; padding-top:1.5rem; border-top:1px solid var(--border); counter-increment:section; }
h2::before{
  content:'§' counter(section);
  font-family:ui-monospace,'JetBrains Mono',Consolas,monospace;
  font-size:.72em; font-weight:400; color:var(--accent);
  letter-spacing:.05em; margin-right:.6em;
}
h3{ font-size:1.1rem; margin:1.75rem 0 .5rem; }
p{ margin:.9rem 0; }
p,li{ color:var(--text); }
ul,ol{ margin:.75rem 0; padding-left:1.5rem; }
li{ margin:.35rem 0; }
a{ color:var(--accent); text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; text-decoration-color:var(--accent-border); }
a:hover{ text-decoration-color:var(--accent); }
hr{ border:none; text-align:center; margin:2.5rem 0; }
hr::after{ content:'···'; letter-spacing:.5em; color:var(--text-muted); font-size:.9rem; }
blockquote{
  margin:1.5rem 0; padding:.25rem 0 .25rem 1.25rem;
  border-left:2px solid var(--accent-border);
  color:var(--text-muted); font-size:1.05rem; line-height:1.85;
}
:not(pre)>code{
  font-family:ui-monospace,'JetBrains Mono',Consolas,monospace;
  font-size:.85em; background:var(--bg-card); border:1px solid var(--border);
  padding:.1em .35em; border-radius:2px;
}
pre{
  background:#221e19; color:#ece4d4; padding:1.1rem 1.25rem; border-radius:3px;
  border-left:2px solid var(--accent);
  overflow-x:auto; font-size:.875rem; line-height:1.7;
}
pre code{ background:none; border:none; padding:0; color:inherit; }
/* Booktabs: rules only above/below the table and under the header */
table{
  border-collapse:collapse; width:100%; margin:1.5rem 0; font-size:.9375rem;
  border-top:1.5px solid var(--text-heading); border-bottom:1.5px solid var(--text-heading);
}
th,td{ padding:.5rem .75rem; text-align:left; }
th{ border-bottom:1px solid var(--text-heading); color:var(--text-heading); font-weight:600; }
td{ border-top:1px solid var(--border); }
tr:first-child td{ border-top:none; }
.callout,.example,.note,.tip,.warning{
  border:1px solid var(--border); border-left:2px solid var(--accent);
  background:var(--bg-card); padding:.9rem 1.1rem; border-radius:2px; margin:1.25rem 0;
}
.warning{ border-left-color:var(--warning); }
.quiz-block{ border:1px solid var(--border); border-radius:3px; padding:1.5rem; margin:2rem 0; background:var(--bg-card); }
.quiz-block .question{ font-weight:600; margin-bottom:1rem; color:var(--text-heading); font-size:1.05rem; }
.quiz-block .option{ position:relative; display:block; padding:.6rem 2.2rem .6rem .9rem; margin:.4rem 0; border:1px solid var(--border); border-radius:2px; background:var(--bg); cursor:pointer; transition:border-color .15s,background .15s; font-size:.95rem; }
.quiz-block .option:hover{ border-color:var(--accent-border); background:var(--accent-light); }
.quiz-block .option.correct{ border-color:var(--success); background:var(--success-bg); }
.quiz-block .option.wrong{ border-color:#b0443c; background:#f8ecea; color:#7c2d26; }
.quiz-block .option.correct::after,.quiz-block .option.wrong::after{
  position:absolute; right:.8rem; top:50%; transform:translateY(-50%);
  font-family:ui-monospace,'JetBrains Mono',Consolas,monospace; font-weight:700;
}
.quiz-block .option.correct::after{ content:'✓'; color:var(--success); }
.quiz-block .option.wrong::after{ content:'✗'; color:#b0443c; }
.quiz-block .feedback{ margin-top:.9rem; padding:.7rem .9rem; border-radius:2px; font-size:.9rem; }
.quiz-block .feedback.correct{ background:var(--success-bg); color:var(--success); }
.quiz-block .feedback.wrong{ background:#f8ecea; color:#7c2d26; }
`;
}

// Typography layer injected AFTER the lesson's own <style>: reading typography
// (font stack, leading, drop cap) wins by cascade order even for older lessons
// that shipped their own fonts, while their colors and block styles stay
// untouched.
function buildTypographyCss(theme: LessonTheme): string {
  const font = FONT_STACKS[theme.font];
  return `
${THEME_FONT_IMPORT}
body{
  font-family:${font};
  line-height:1.9; letter-spacing:.01em;
}
h1,h2,h3,h4{
  font-family:${font};
  font-weight:600; line-height:1.35;
}
pre,code{ font-family:ui-monospace,'JetBrains Mono',Consolas,monospace; }
h1 + p::first-letter{
  float:left; font-size:3.1em; line-height:.88;
  padding:.06em .14em 0 0; color:var(--accent); font-weight:600;
}
`;
}

interface QuizState {
  selectedOption: number | null;
  answered: boolean;
}

interface LessonRendererProps {
  htmlContent: string;
  onQuizAnswer?: (quizId: string, correct: boolean) => void;
  /** Optional escape hatch so the parent can locate headings for TOC scrolling. */
  frameRef?: RefObject<HTMLIFrameElement | null>;
  /** Document theme — drives the injected base palette + typography. */
  theme: LessonTheme;
}

export function LessonRenderer({ htmlContent, onQuizAnswer, frameRef, theme }: LessonRendererProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  const setFrameEl = useCallback((el: HTMLIFrameElement | null) => {
    (iframeRef as RefObject<HTMLIFrameElement | null>).current = el;
    if (frameRef) frameRef.current = el;
  }, [frameRef]);

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

          onQuizAnswer?.(quizId, isCorrect);
        });
      });
    });
  }, [onQuizAnswer]);

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
    baseStyle.textContent = buildBaseCss(theme);
    doc.head.insertBefore(baseStyle, doc.head.firstChild);

    // Inject the theme typography layer AFTER the lesson's own styles so the
    // selected font stack / reading rhythm win by cascade order for every
    // lesson, old or new. Colors and block styles from the lesson stay put.
    const typoStyle = doc.createElement('style');
    typoStyle.textContent = buildTypographyCss(theme);
    doc.head.appendChild(typoStyle);

    // Inject quiz hide/show rules LAST so they always take precedence.
    const quizStyle = doc.createElement('style');
    quizStyle.textContent = `
      .quiz-block .feedback { display: none !important; }
      .quiz-block .feedback.show { display: block !important; }
    `;
    doc.head.appendChild(quizStyle);

    // Setup quiz interactivity
    setupQuizListeners(doc);

    // Tag headings with deterministic TOC anchors (mirrors extractToc ordering:
    // only non-empty h1–h3 count). Enables the page-level table of contents to
    // scroll to sections inside this iframe.
    const headings = Array.from(doc.querySelectorAll(TOC_HEADING_SELECTOR))
      .filter(h => (h.textContent || '').trim());
    headings.forEach((h, i) => { h.id = tocHeadingId(i); });

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
  }, [htmlContent, setupQuizListeners, theme]);

  return (
    <iframe
      ref={setFrameEl}
      title="Lesson Content"
      sandbox="allow-scripts allow-same-origin"
      className="w-full border-none rounded-lg"
      style={{ height: `${height}px`, minHeight: '400px', background: theme.vars.bg }}
    />
  );
}
