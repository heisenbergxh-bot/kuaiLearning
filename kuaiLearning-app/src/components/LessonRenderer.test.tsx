// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LessonRenderer } from './LessonRenderer';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
});

const lessonHtml = `<!doctype html><html><head></head><body>
  <div class="quiz-block" data-quiz-id="q1">
    <div class="question">Choose one</div>
    <div class="option" data-correct="true">Right</div>
    <div class="option" data-correct="false">Wrong</div>
    <div class="feedback correct">Correct</div>
    <div class="feedback wrong">Try again</div>
  </div>
</body></html>`;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('lesson quiz interaction', () => {
  it('keeps the selected answer when the parent callback changes', async () => {
    const firstCallback = vi.fn();
    await act(async () => root.render(
      <LessonRenderer htmlContent={lessonHtml} onQuizAnswer={firstCallback} />,
    ));

    const iframe = container.querySelector('iframe')!;
    const firstOption = iframe.contentDocument!.querySelector<HTMLElement>('.option')!;
    await act(async () => firstOption.click());
    expect(firstCallback).toHaveBeenCalledWith('q1', true);
    expect(firstOption.classList.contains('correct')).toBe(true);

    const nextCallback = vi.fn();
    await act(async () => root.render(
      <LessonRenderer htmlContent={lessonHtml} onQuizAnswer={nextCallback} />,
    ));

    const optionAfterRerender = iframe.contentDocument!.querySelector<HTMLElement>('.option')!;
    expect(optionAfterRerender.classList.contains('correct')).toBe(true);
  });
});
