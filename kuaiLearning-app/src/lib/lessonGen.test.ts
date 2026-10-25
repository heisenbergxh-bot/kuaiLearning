import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIGenerateLessonResponse, Settings, Workspace } from '../types';
import { db } from '../db';
import { generateLessonStream } from '../ai/client';
import { generateAndSaveLesson } from './lessonGen';
import * as learningSync from '../api/learningContentSync';
import { synchronizeLibrary } from '../api/librarySync';
import type { LessonGenerationPhase } from './generationProgress';

vi.mock('../api/librarySync', () => ({
  synchronizeLibrary: vi.fn(async (_workspaceId: string, beforeSync?: () => Promise<void>) => { await beforeSync?.(); }),
}));

vi.mock('../ai/client', () => ({
  generateLessonStream: vi.fn(),
}));

const settings: Settings = {
  language: 'en',
  theme: 'system',
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
  vi.restoreAllMocks();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  await db.workspaces.add(workspace);
  vi.mocked(generateLessonStream).mockResolvedValue(generatedLesson);
});

describe('generateAndSaveLesson', () => {
  it('reports completion only after persistence and cloud sync finish', async () => {
    const phases: LessonGenerationPhase[] = [];
    vi.mocked(generateLessonStream).mockImplementationOnce(async (
      _settings, _workspaceId, _request, onChunk, _target, onPhase,
    ) => {
      onPhase?.('waiting');
      onPhase?.('generating');
      onChunk?.('lesson content');
      onPhase?.('validating');
      return generatedLesson;
    });
    vi.spyOn(learningSync, 'pushLocalLesson').mockImplementationOnce(async lesson => {
      expect(phases.at(-1)).toBe('syncing');
      expect(await db.lessons.get(lesson.id)).toBeDefined();
      return lesson;
    });
    const onChunk = vi.fn();
    await generateAndSaveLesson(settings, workspace.id, { onPhase: phase => phases.push(phase), onChunk });
    expect(phases).toEqual(['preparing', 'waiting', 'generating', 'validating', 'saving', 'syncing', 'done']);
    expect(onChunk).toHaveBeenCalledWith('lesson content');
  });

  it('reports a usable local lesson when cloud sync fails', async () => {
    const phases: LessonGenerationPhase[] = [];
    vi.spyOn(learningSync, 'pushLocalLesson').mockRejectedValueOnce(new Error('network unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lesson = await generateAndSaveLesson(settings, workspace.id, { onPhase: phase => phases.push(phase) });
    expect(phases.at(-1)).toBe('local-only');
    expect(phases).not.toContain('done');
    expect(await db.lessons.get(lesson.id)).toBeDefined();
  });

  it('persists a lesson and all derived records together', async () => {
    await generateAndSaveLesson(settings, workspace.id);

    await expect(db.lessons.count()).resolves.toBe(1);
    await expect(db.quizQuestions.count()).resolves.toBe(1);
    await expect(db.glossaryTerms.count()).resolves.toBe(1);
    await expect(db.learningRecords.count()).resolves.toBe(1);
    await expect(db.references.count()).resolves.toBe(1);
    await expect(db.resources.count()).resolves.toBe(1);
  });

  it('does not report cloud completion when only the derived item upload fails', async () => {
    const phases: LessonGenerationPhase[] = [];
    vi.spyOn(learningSync, 'pushLocalLesson').mockImplementationOnce(async lesson => lesson);
    vi.mocked(synchronizeLibrary).mockImplementationOnce(async (_id, beforeSync) => {
      await beforeSync?.();
      throw new Error('references upload unavailable');
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await generateAndSaveLesson(settings, workspace.id, { onPhase: phase => phases.push(phase) });
    expect(phases.at(-1)).toBe('local-only');
    expect(phases).not.toContain('done');
    await expect(db.references.count()).resolves.toBe(1);
    await expect(db.glossaryTerms.count()).resolves.toBe(1);
    await expect(db.learningRecords.count()).resolves.toBe(1);
  });

  it('rolls every write back when a derived record fails', async () => {
    const onPhase = vi.fn();
    vi.spyOn(db.glossaryTerms, 'add').mockRejectedValueOnce(new Error('write failed'));

    await expect(generateAndSaveLesson(settings, workspace.id, { onPhase })).rejects.toThrow('write failed');
    expect(onPhase).not.toHaveBeenCalledWith('done');
    expect(onPhase).not.toHaveBeenCalledWith('local-only');
    await expect(db.lessons.count()).resolves.toBe(0);
    await expect(db.quizQuestions.count()).resolves.toBe(0);
    await expect(db.learningRecords.count()).resolves.toBe(0);
    await expect(db.references.count()).resolves.toBe(0);
    await expect(db.resources.count()).resolves.toBe(0);
  });
});
