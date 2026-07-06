// Parse quiz blocks out of generated lesson HTML so they can be collected into
// the question bank. Mirrors the structure consumed by LessonRenderer:
//   <div class="quiz-block">
//     <div class="question">...</div>
//     <div class="option" data-correct="true|false">...</div> (repeated)
//     <div class="feedback correct">...</div>
//     <div class="feedback wrong">...</div>
//   </div>

export interface ExtractedQuiz {
  question: string;
  options: { text: string; correct: boolean }[];
  feedbackCorrect?: string;
  feedbackWrong?: string;
}

export function extractQuizzes(html: string): ExtractedQuiz[] {
  if (!html) return [];
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }

  const blocks = Array.from(doc.querySelectorAll('.quiz-block'));
  const quizzes: ExtractedQuiz[] = [];

  for (const block of blocks) {
    const question = block.querySelector('.question')?.textContent?.trim() || '';
    const options = Array.from(block.querySelectorAll('.option')).map(opt => ({
      text: opt.textContent?.trim() || '',
      correct: opt.getAttribute('data-correct') === 'true',
    })).filter(o => o.text.length > 0);

    // Need a real question and at least 2 options with exactly one correct answer.
    const correctCount = options.filter(o => o.correct).length;
    if (!question || options.length < 2 || correctCount !== 1) continue;

    quizzes.push({
      question,
      options,
      feedbackCorrect: block.querySelector('.feedback.correct')?.textContent?.trim() || undefined,
      feedbackWrong: block.querySelector('.feedback.wrong')?.textContent?.trim() || undefined,
    });
  }

  return quizzes;
}
