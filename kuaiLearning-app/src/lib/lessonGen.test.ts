import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIGenerateLessonResponse, Settings, Workspace } from '../types';
import { db } from '../db';
import { generateLessonStream } from '../ai/client';
import { generateAndSaveLesson } from './lessonGen';

vi.mock('../ai/client', () => ({
  generateLessonStream: vi.fn(),
}));

const settings: Settings = {
  language: 'en',
};

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Test workspace',
  mission: {
    topic: 'Testing',
    why: 'Verify persistence',
    successLooksLike: [],
    constraints: '',
    outOfScope: '',
  },
  notes: '',
  createdAt: 1,
  updatedAt: 1,
};

const generatedLesson: AIGenerateLessonResponse = {
  title: 'Atomic persistence',
  slug: 'atomic-persistence',
  htmlContent: `
    <div class="quiz-block">
      <div class="question">Is this atomic?</div>
      <div class="option" data-correct="true">Yes</div>
      <div class="option" data-correct="false">No</div>
    </div>
  `,
  glossaryTerms: [{ term: 'Atomic', definition: 'All or nothing', avoid: [] }],
  learningRecord: { title: 'Learned transactions', content: 'Writes are atomic.' },
  reference: { title: 'Transaction reference', htmlContent: '<p>Atomic</p>' },
  primarySource: { title: 'Dexie', url: 'https://dexie.org' },
};

beforeAll(() => {
  globalThis.DOMParser = new JSDOM().window.DOMParser;
});

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  await db.workspaces.add(workspace);
  vi.mocked(generateLessonStream).mockResolvedValue(generatedLesson);
});

describe('generateAndSaveLesson', () => {
  it('persists a lesson and all derived records together', async () => {
    await generateAndSaveLesson(settings, workspace.id);

    await expect(db.lessons.count()).resolves.toBe(1);
    await expect(db.quizQuestions.count()).resolves.toBe(1);
    await expect(db.glossaryTerms.count()).resolves.toBe(1);
    await expect(db.learningRecords.count()).resolves.toBe(1);
    await expect(db.references.count()).resolves.toBe(1);
    await expect(db.resources.count()).resolves.toBe(1);
  });

  it('rolls every write back when a derived record fails', async () => {
    vi.spyOn(db.glossaryTerms, 'add').mockRejectedValueOnce(new Error('write failed'));

    await expect(generateAndSaveLesson(settings, workspace.id)).rejects.toThrow('write failed');
    await expect(db.lessons.count()).resolves.toBe(0);
    await expect(db.quizQuestions.count()).resolves.toBe(0);
    await expect(db.learningRecords.count()).resolves.toBe(0);
    await expect(db.references.count()).resolves.toBe(0);
    await expect(db.resources.count()).resolves.toBe(0);
  });
});
