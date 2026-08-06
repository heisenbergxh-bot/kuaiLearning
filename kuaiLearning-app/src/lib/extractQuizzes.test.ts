import { JSDOM } from 'jsdom';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractQuizzes } from './extractQuizzes';

beforeAll(() => {
  globalThis.DOMParser = new JSDOM().window.DOMParser;
});

describe('extractQuizzes', () => {
  it('extracts a valid quiz and its feedback', () => {
    const quizzes = extractQuizzes(`
      <div class="quiz-block">
        <div class="question">2 + 2?</div>
        <div class="option" data-correct="false">3</div>
        <div class="option" data-correct="true">4</div>
        <div class="feedback correct">Correct</div>
        <div class="feedback wrong">Try again</div>
      </div>
    `);

    expect(quizzes).toEqual([{
      question: '2 + 2?',
      options: [
        { text: '3', correct: false },
        { text: '4', correct: true },
      ],
      feedbackCorrect: 'Correct',
      feedbackWrong: 'Try again',
    }]);
  });

  it('rejects malformed quizzes', () => {
    const quizzes = extractQuizzes(`
      <div class="quiz-block">
        <div class="question">No unique answer</div>
        <div class="option" data-correct="true">A</div>
        <div class="option" data-correct="true">B</div>
      </div>
    `);

    expect(quizzes).toEqual([]);
  });
});
