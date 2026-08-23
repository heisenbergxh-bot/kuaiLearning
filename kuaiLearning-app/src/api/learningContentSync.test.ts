import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Lesson } from '../types';
import {
  listRemoteLessons,
  listRemoteSyllabus,
  upsertRemoteLesson,
  upsertRemoteSyllabusItem,
  type RemoteLesson,
  type RemoteSyllabusItem,
} from './learningContent';
import { synchronizeLearningContent } from './learningContentSync';

vi.mock('./learningContent', async importOriginal => {
  const original = await importOriginal<typeof import('./learningContent')>();
  return {
    ...original,
    listRemoteLessons: vi.fn(),
    listRemoteSyllabus: vi.fn(),
    upsertRemoteLesson: vi.fn(),
    upsertRemoteSyllabusItem: vi.fn(),
  };
});

const localLesson: Lesson = {
  id: 'lesson-1',
  workspaceId: 'workspace-1',
  number: 1,
  title: '事务边界',
  slug: 'transaction-boundary',
  htmlContent: '<h1>事务边界</h1>',
  createdAt: 1000,
  updatedAt: 2000,
};

const remoteLesson: RemoteLesson = {
  id: 'lesson-1',
  workspace_id: 'workspace-1',
  title: '事务边界',
  summary: null,
  source_type: 'generated',
  source_ref: null,
  order_index: 1,
  status: 'generated',
  content_payload: {
    schema_version: 1,
    slug: 'transaction-boundary',
    html_content: '<h1>事务边界</h1>',
    primary_source: null,
    completed_at_ms: null,
    quiz_correct: null,
    quiz_total: null,
    last_viewed_at_ms: null,
  },
  client_updated_at_ms: 2000,
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
};

const remoteSyllabus: RemoteSyllabusItem = {
  id: 'item-1',
  workspace_id: 'workspace-1',
  order_index: 1,
  module_title: '基础',
  title: '事务边界',
  description: '理解事务边界',
  status: 'generated',
  lesson_id: 'lesson-1',
  client_updated_at_ms: 2000,
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
};

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  vi.clearAllMocks();
  vi.mocked(listRemoteLessons).mockResolvedValue([]);
  vi.mocked(listRemoteSyllabus).mockResolvedValue([]);
});

describe('learning content synchronization', () => {
  it('uploads a legacy local lesson once and marks the cached copy as synchronized', async () => {
    await db.lessons.add(localLesson);
    vi.mocked(upsertRemoteLesson).mockResolvedValue(remoteLesson);

    await synchronizeLearningContent('workspace-1');

    expect(upsertRemoteLesson).toHaveBeenCalledWith(localLesson);
    expect((await db.lessons.get(localLesson.id))?.serverSyncedAt).toEqual(expect.any(Number));
  });

  it('restores a remote course and its syllabus link on a new browser', async () => {
    vi.mocked(listRemoteLessons).mockResolvedValue([remoteLesson]);
    vi.mocked(listRemoteSyllabus).mockResolvedValue([remoteSyllabus]);

    await synchronizeLearningContent('workspace-1');

    expect((await db.lessons.get('lesson-1'))?.htmlContent).toBe('<h1>事务边界</h1>');
    expect((await db.syllabusItems.get('item-1'))?.lessonId).toBe('lesson-1');
    expect(upsertRemoteSyllabusItem).not.toHaveBeenCalled();
  });

  it('removes a previously synchronized lesson that was deleted on another browser', async () => {
    await db.lessons.add({ ...localLesson, serverSyncedAt: 3000 });

    await synchronizeLearningContent('workspace-1');

    await expect(db.lessons.get('lesson-1')).resolves.toBeUndefined();
    expect(upsertRemoteLesson).not.toHaveBeenCalled();
  });
});
