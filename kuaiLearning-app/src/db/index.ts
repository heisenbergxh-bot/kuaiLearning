import Dexie, { type EntityTable } from 'dexie';
import type { Workspace, Lesson, LearningRecord, GlossaryTerm, Resource, Reference, ChatMessage, QuizQuestion, SyllabusItem } from '../types';
export { generateId } from '../lib/generateId';

export class KuaiLearningDB extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>;
  lessons!: EntityTable<Lesson, 'id'>;
  learningRecords!: EntityTable<LearningRecord, 'id'>;
  glossaryTerms!: EntityTable<GlossaryTerm, 'id'>;
  resources!: EntityTable<Resource, 'id'>;
  references!: EntityTable<Reference, 'id'>;
  chatMessages!: EntityTable<ChatMessage, 'id'>;
  quizQuestions!: EntityTable<QuizQuestion, 'id'>;
  syllabusItems!: EntityTable<SyllabusItem, 'id'>;

  constructor() {
    super('kuailearning');

    this.version(1).stores({
      workspaces: 'id, name, updatedAt',
      lessons: 'id, workspaceId, number, createdAt',
      learningRecords: 'id, workspaceId, number, createdAt',
      glossaryTerms: 'id, workspaceId, term, createdAt',
      resources: 'id, workspaceId, type, createdAt',
    });

    this.version(2).stores({
      workspaces: 'id, name, updatedAt',
      lessons: 'id, workspaceId, number, createdAt',
      learningRecords: 'id, workspaceId, number, createdAt',
      glossaryTerms: 'id, workspaceId, term, createdAt',
      resources: 'id, workspaceId, type, createdAt',
      chatMessages: 'id, lessonId, createdAt',
    });

    this.version(3).stores({
      workspaces: 'id, name, updatedAt',
      lessons: 'id, workspaceId, number, createdAt',
      learningRecords: 'id, workspaceId, number, createdAt',
      glossaryTerms: 'id, workspaceId, term, createdAt',
      resources: 'id, workspaceId, type, createdAt',
      chatMessages: 'id, lessonId, createdAt',
      references: 'id, workspaceId, sourceLessonId, createdAt',
    });

    this.version(4).stores({
      workspaces: 'id, name, updatedAt',
      lessons: 'id, workspaceId, number, createdAt',
      learningRecords: 'id, workspaceId, number, createdAt',
      glossaryTerms: 'id, workspaceId, term, createdAt',
      resources: 'id, workspaceId, type, createdAt',
      chatMessages: 'id, lessonId, createdAt',
      references: 'id, workspaceId, sourceLessonId, createdAt',
      quizQuestions: 'id, workspaceId, lessonId, createdAt',
    });

    this.version(5).stores({
      workspaces: 'id, name, updatedAt',
      lessons: 'id, workspaceId, number, createdAt',
      learningRecords: 'id, workspaceId, number, createdAt',
      glossaryTerms: 'id, workspaceId, term, createdAt',
      resources: 'id, workspaceId, type, createdAt',
      chatMessages: 'id, lessonId, createdAt',
      references: 'id, workspaceId, sourceLessonId, createdAt',
      quizQuestions: 'id, workspaceId, lessonId, createdAt',
      syllabusItems: 'id, workspaceId, order, createdAt',
    });
  }
}

export const db = new KuaiLearningDB();

export async function deleteLocalLessonData(lessonId: string): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.lessons,
      db.quizQuestions,
      db.references,
      db.chatMessages,
      db.glossaryTerms,
      db.learningRecords,
    ],
    async () => {
      await db.quizQuestions.where('lessonId').equals(lessonId).delete();
      await db.references.where('sourceLessonId').equals(lessonId).delete();
      await db.chatMessages.where('lessonId').equals(lessonId).delete();
      const terms = await db.glossaryTerms.filter(item => item.sourceLessonId === lessonId).primaryKeys();
      if (terms.length > 0) await db.glossaryTerms.bulkDelete(terms as string[]);
      const records = await db.learningRecords.filter(item => item.sourceLessonId === lessonId).primaryKeys();
      if (records.length > 0) await db.learningRecords.bulkDelete(records as string[]);
      await db.lessons.delete(lessonId);
    },
  );
}

export async function deleteLocalWorkspaceData(id: string): Promise<void> {
  const lessonIds = (await db.lessons.where('workspaceId').equals(id).primaryKeys()) as string[];
  await db.transaction(
    'rw',
    [
      db.workspaces,
      db.lessons,
      db.learningRecords,
      db.glossaryTerms,
      db.resources,
      db.references,
      db.quizQuestions,
      db.syllabusItems,
      db.chatMessages,
    ],
    async () => {
      await db.workspaces.delete(id);
      await db.lessons.where('workspaceId').equals(id).delete();
      await db.learningRecords.where('workspaceId').equals(id).delete();
      await db.glossaryTerms.where('workspaceId').equals(id).delete();
      await db.resources.where('workspaceId').equals(id).delete();
      await db.references.where('workspaceId').equals(id).delete();
      await db.quizQuestions.where('workspaceId').equals(id).delete();
      await db.syllabusItems.where('workspaceId').equals(id).delete();
      if (lessonIds.length > 0) {
        await db.chatMessages.where('lessonId').anyOf(lessonIds).delete();
      }
    },
  );
}
