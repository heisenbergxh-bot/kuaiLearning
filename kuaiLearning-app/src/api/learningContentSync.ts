import { db, deleteLocalLessonData } from '../db';
import type { Lesson, SyllabusItem } from '../types';
import {
  lessonFromRemote,
  listRemoteLessons,
  listRemoteSyllabus,
  syllabusItemFromRemote,
  upsertRemoteLesson,
  upsertRemoteSyllabusItem,
  type RemoteLesson,
  type RemoteSyllabusItem,
} from './learningContent';

function remoteLessonTimestamp(remote: RemoteLesson): number {
  return remote.client_updated_at_ms ?? Date.parse(remote.updated_at);
}

function remoteSyllabusTimestamp(remote: RemoteSyllabusItem): number {
  return remote.client_updated_at_ms ?? Date.parse(remote.updated_at);
}

export async function pushLocalLesson(lesson: Lesson): Promise<Lesson> {
  const saved = lessonFromRemote(await upsertRemoteLesson(lesson));
  await db.lessons.put(saved);
  return saved;
}

export async function updateLocalLessonAndSync(
  lessonId: string,
  changes: Partial<Lesson>,
): Promise<Lesson | undefined> {
  const updatedAt = Date.now();
  await db.lessons.update(lessonId, { ...changes, updatedAt });
  const lesson = await db.lessons.get(lessonId);
  if (!lesson) return undefined;
  try {
    return await pushLocalLesson(lesson);
  } catch (reason) {
    console.warn('Lesson will be synchronized on the next page load.', reason);
    return lesson;
  }
}

export async function pushLocalSyllabusItem(item: SyllabusItem): Promise<SyllabusItem> {
  const saved = syllabusItemFromRemote(await upsertRemoteSyllabusItem(item));
  await db.syllabusItems.put(saved);
  return saved;
}

export async function synchronizeLearningContent(workspaceId: string): Promise<void> {
  const [localLessons, localSyllabus, remoteLessons, remoteSyllabus] = await Promise.all([
    db.lessons.where('workspaceId').equals(workspaceId).toArray(),
    db.syllabusItems.where('workspaceId').equals(workspaceId).toArray(),
    listRemoteLessons(workspaceId),
    listRemoteSyllabus(workspaceId),
  ]);

  const remoteLessonById = new Map(remoteLessons.map(item => [item.id, item]));
  const localLessonById = new Map(localLessons.map(item => [item.id, item]));

  for (const remote of remoteLessons) {
    const local = localLessonById.get(remote.id);
    if (!local || remoteLessonTimestamp(remote) >= local.updatedAt) {
      await db.lessons.put(lessonFromRemote(remote));
    } else {
      await pushLocalLesson(local);
    }
  }
  for (const local of localLessons) {
    if (remoteLessonById.has(local.id)) continue;
    if (local.serverSyncedAt) {
      await deleteLocalLessonData(local.id);
    } else {
      await pushLocalLesson(local);
    }
  }

  const remoteSyllabusById = new Map(remoteSyllabus.map(item => [item.id, item]));
  const localSyllabusById = new Map(localSyllabus.map(item => [item.id, item]));

  for (const remote of remoteSyllabus) {
    const local = localSyllabusById.get(remote.id);
    const localTimestamp = local?.updatedAt ?? local?.createdAt ?? 0;
    if (!local || remoteSyllabusTimestamp(remote) >= localTimestamp) {
      await db.syllabusItems.put(syllabusItemFromRemote(remote));
    } else {
      await pushLocalSyllabusItem(local);
    }
  }
  for (const local of localSyllabus) {
    if (remoteSyllabusById.has(local.id)) continue;
    if (local.serverSyncedAt) {
      await db.syllabusItems.delete(local.id);
    } else {
      await pushLocalSyllabusItem(local);
    }
  }
}
