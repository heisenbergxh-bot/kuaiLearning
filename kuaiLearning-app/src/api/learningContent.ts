import type { Lesson, SyllabusItem } from '../types';
import { requestJson, requestNoContent } from './http';

interface RemotePrimarySource {
  title: string;
  url: string;
}

interface RemoteLessonContent {
  schema_version: 1;
  slug: string;
  html_content: string;
  primary_source: RemotePrimarySource | null;
  completed_at_ms: number | null;
  quiz_correct: number | null;
  quiz_total: number | null;
  last_viewed_at_ms: number | null;
}

export interface RemoteLesson {
  id: string;
  workspace_id: string;
  title: string;
  summary: string | null;
  source_type: string;
  source_ref: string | null;
  order_index: number;
  status: string;
  content_payload: RemoteLessonContent;
  client_updated_at_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface RemoteSyllabusItem {
  id: string;
  workspace_id: string;
  order_index: number;
  module_title: string;
  title: string;
  description: string;
  status: 'planned' | 'generated';
  lesson_id: string | null;
  client_updated_at_ms: number | null;
  created_at: string;
  updated_at: string;
}

function lessonWrite(lesson: Lesson) {
  return {
    title: lesson.title,
    summary: null,
    source_type: 'generated',
    source_ref: lesson.primarySource?.url || null,
    order_index: lesson.number,
    status: lesson.completedAt ? 'completed' : 'generated',
    content_payload: {
      schema_version: 1,
      slug: lesson.slug,
      html_content: lesson.htmlContent,
      primary_source: lesson.primarySource || null,
      completed_at_ms: lesson.completedAt ?? null,
      quiz_correct: lesson.quizCorrect ?? null,
      quiz_total: lesson.quizTotal ?? null,
      last_viewed_at_ms: lesson.lastViewedAt ?? null,
    },
    client_updated_at_ms: lesson.updatedAt,
  };
}

function syllabusWrite(item: SyllabusItem) {
  return {
    order_index: item.order,
    module_title: item.module,
    title: item.title,
    description: item.description,
    status: item.status,
    lesson_id: item.lessonId ?? null,
    client_updated_at_ms: item.updatedAt ?? item.createdAt,
  };
}

export function lessonFromRemote(remote: RemoteLesson): Lesson {
  const content = remote.content_payload;
  const createdAt = Date.parse(remote.created_at);
  const updatedAt = remote.client_updated_at_ms ?? Date.parse(remote.updated_at);
  return {
    id: remote.id,
    workspaceId: remote.workspace_id,
    number: remote.order_index,
    title: remote.title,
    slug: content.slug,
    htmlContent: content.html_content,
    primarySource: content.primary_source ?? undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : updatedAt,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    completedAt: content.completed_at_ms ?? undefined,
    quizCorrect: content.quiz_correct ?? undefined,
    quizTotal: content.quiz_total ?? undefined,
    lastViewedAt: content.last_viewed_at_ms ?? undefined,
    serverSyncedAt: Date.now(),
  };
}

export function syllabusItemFromRemote(remote: RemoteSyllabusItem): SyllabusItem {
  const createdAt = Date.parse(remote.created_at);
  const updatedAt = remote.client_updated_at_ms ?? Date.parse(remote.updated_at);
  return {
    id: remote.id,
    workspaceId: remote.workspace_id,
    order: remote.order_index,
    module: remote.module_title,
    title: remote.title,
    description: remote.description,
    status: remote.status,
    lessonId: remote.lesson_id ?? undefined,
    createdAt: Number.isFinite(createdAt) ? createdAt : updatedAt,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    serverSyncedAt: Date.now(),
  };
}

export async function listRemoteLessons(workspaceId: string): Promise<RemoteLesson[]> {
  const pageSize = 200;
  const result: RemoteLesson[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await requestJson<RemoteLesson[]>(
      `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/lessons?limit=${pageSize}&offset=${offset}`,
    );
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export function listRemoteSyllabus(workspaceId: string): Promise<RemoteSyllabusItem[]> {
  return requestJson(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/syllabus`);
}

export function upsertRemoteLesson(lesson: Lesson): Promise<RemoteLesson> {
  return requestJson(
    `/api/v1/workspaces/${encodeURIComponent(lesson.workspaceId)}/lessons/${encodeURIComponent(lesson.id)}`,
    { method: 'PUT', body: JSON.stringify(lessonWrite(lesson)) },
  );
}

export function deleteRemoteLesson(workspaceId: string, lessonId: string): Promise<void> {
  return requestNoContent(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/lessons/${encodeURIComponent(lessonId)}`,
    { method: 'DELETE' },
  );
}

export function upsertRemoteSyllabusItem(item: SyllabusItem): Promise<RemoteSyllabusItem> {
  return requestJson(
    `/api/v1/workspaces/${encodeURIComponent(item.workspaceId)}/syllabus/${encodeURIComponent(item.id)}`,
    { method: 'PUT', body: JSON.stringify(syllabusWrite(item)) },
  );
}

export function deleteRemoteSyllabusItem(workspaceId: string, itemId: string): Promise<void> {
  return requestNoContent(
    `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/syllabus/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' },
  );
}
