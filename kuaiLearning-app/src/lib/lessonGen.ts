import type { Lesson, Settings, SyllabusItem } from '../types';
import { generateLessonStream } from '../ai/client';
import { extractQuizzes } from './extractQuizzes';
import { db, deleteLocalLessonData, generateId } from '../db';
import { deleteRemoteLesson } from '../api/learningContent';
import { pushLocalLesson, pushLocalSyllabusItem } from '../api/learningContentSync';

interface GenerateOpts {
  targetItem?: SyllabusItem;
  userRequest?: string;
  reuseNumber?: number;
  onChunk?: (chunk: string) => void;
}

// Generate a lesson and persist it together with all its derived data
// (quiz bank, glossary terms, learning record, reference cheat-sheet, cited
// resource). When a targetItem is given, the syllabus item is linked back.
// Shared by the roadmap generate flow and the lesson "regenerate" flow.
export async function generateAndSaveLesson(
  settings: Settings,
  workspaceId: string,
  opts: GenerateOpts = {},
): Promise<Lesson> {
  const { targetItem, userRequest, reuseNumber, onChunk } = opts;

  const result = await generateLessonStream(
    settings,
    workspaceId,
    targetItem ? userRequest : (userRequest || undefined),
    onChunk,
    targetItem?.id,
  );

  const now = Date.now();
  const lesson = await db.transaction('rw', [
    db.lessons, db.syllabusItems, db.quizQuestions, db.glossaryTerms,
    db.learningRecords, db.references, db.resources,
  ], async () => {
  let number = reuseNumber;
  if (number == null) {
    const lessons = await db.lessons.where('workspaceId').equals(workspaceId).toArray();
    number = lessons.length > 0 ? Math.max(...lessons.map(l => l.number)) + 1 : 1;
  }

  const lesson: Lesson = {
    id: generateId(),
    workspaceId,
    number,
    title: result.title,
    slug: result.slug,
    htmlContent: result.htmlContent,
    primarySource: result.primarySource,
    createdAt: now,
    updatedAt: now,
  };
  await db.lessons.add(lesson);

  if (targetItem) {
    await db.syllabusItems.update(targetItem.id, {
      status: 'generated',
      lessonId: lesson.id,
      updatedAt: now,
    });
  }

  // Quiz bank
  for (const q of extractQuizzes(result.htmlContent)) {
    await db.quizQuestions.add({
      id: generateId(),
      workspaceId,
      lessonId: lesson.id,
      lessonNumber: number,
      question: q.question,
      options: q.options,
      feedbackCorrect: q.feedbackCorrect,
      feedbackWrong: q.feedbackWrong,
      createdAt: now,
      timesAnswered: 0,
      timesCorrect: 0,
    });
  }

  // Glossary terms
  if (result.glossaryTerms?.length > 0) {
    for (const term of result.glossaryTerms) {
      await db.glossaryTerms.add({
        id: generateId(),
        workspaceId,
        term: term.term,
        definition: term.definition,
        avoid: term.avoid || [],
        sourceLessonId: lesson.id,
        sourceLessonNumber: number,
        createdAt: now,
      });
    }
  }

  // Learning record
  if (result.learningRecord) {
    const records = await db.learningRecords.where('workspaceId').equals(workspaceId).toArray();
    const nextRecordNumber = records.length > 0 ? Math.max(...records.map(r => r.number)) + 1 : 1;
    await db.learningRecords.add({
      id: generateId(),
      workspaceId,
      number: nextRecordNumber,
      title: result.learningRecord.title,
      content: result.learningRecord.content,
      status: 'active',
      sourceLessonId: lesson.id,
      createdAt: now,
    });
  }

  // Reference cheat-sheet
  if (result.reference) {
    await db.references.add({
      id: generateId(),
      workspaceId,
      title: result.reference.title,
      htmlContent: result.reference.htmlContent,
      sourceLessonId: lesson.id,
      sourceLessonNumber: number,
      createdAt: now,
    });
  }

  // Cited source → resources (dedupe by URL)
  if (result.primarySource?.url) {
    const existing = await db.resources
      .where('workspaceId').equals(workspaceId)
      .and(r => r.url === result.primarySource!.url)
      .first();
    if (!existing) {
      await db.resources.add({
        id: generateId(),
        workspaceId,
        title: result.primarySource.title,
        url: result.primarySource.url,
        type: 'knowledge',
        description: '',
        sourceLessonNumber: number,
        createdAt: now,
      });
    }
  }

  return lesson;
  });

  try {
    const synchronizedLesson = await pushLocalLesson(lesson);
    if (targetItem) {
      const synchronizedItem = await db.syllabusItems.get(targetItem.id);
      if (synchronizedItem) await pushLocalSyllabusItem(synchronizedItem);
    }
    return synchronizedLesson;
  } catch (reason) {
    console.warn('Generated lesson remains local and will be synchronized later.', reason);
    return lesson;
  }
}

// Delete a lesson and all data derived from it. Does NOT touch the linked
// syllabus item (caller decides) nor resources (sources may be shared).
export async function deleteLessonCascade(lessonId: string): Promise<void> {
  const lesson = await db.lessons.get(lessonId);
  if (lesson) {
    await deleteRemoteLesson(lesson.workspaceId, lesson.id);
  }
  await deleteLocalLessonData(lessonId);
}
