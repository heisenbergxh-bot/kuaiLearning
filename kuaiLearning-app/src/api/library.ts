import type { Table } from 'dexie';
import { db } from '../db';
import type { Reference, GlossaryTerm, LearningRecord } from '../types';
import { requestJson, requestNoContent } from './http';

export type LibraryKind = 'references' | 'glossary' | 'records';
export type LibraryEntry = Reference | GlossaryTerm | LearningRecord;
export const libraryKinds: LibraryKind[] = ['references', 'glossary', 'records'];
export interface RemoteLibraryItem {
  id: string;
  workspace_id: string;
  kind: LibraryKind;
  content_payload: Record<string, unknown>;
  client_updated_at_ms: number;
  is_deleted: boolean;
}

export function libraryTable(kind: LibraryKind): Table<LibraryEntry, string> {
  const tables = { references: db.references, glossary: db.glossaryTerms, records: db.learningRecords };
  return tables[kind] as unknown as Table<LibraryEntry, string>;
}

function path(workspaceId: string, kind: LibraryKind): string {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/library/${kind}`;
}

export async function listRemoteLibrary(workspaceId: string, kind: LibraryKind): Promise<RemoteLibraryItem[]> {
  const items: RemoteLibraryItem[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: '200' });
    if (cursor) params.set('after_id', cursor);
    const page = await requestJson<{ items: RemoteLibraryItem[]; next_cursor: string | null }>(`${path(workspaceId, kind)}?${params}`, { cache: 'no-store' });
    items.push(...page.items);
    if (page.next_cursor === cursor && cursor !== null) throw new Error('Library pagination did not advance');
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

export function upsertRemoteLibrary(kind: LibraryKind, item: LibraryEntry): Promise<RemoteLibraryItem> {
  const payload = { ...item } as Record<string, unknown>;
  for (const key of ['id', 'workspaceId', 'updatedAt', 'serverSyncedAt']) delete payload[key];
  return requestJson(`${path(item.workspaceId, kind)}/${encodeURIComponent(item.id)}`, {
    method: 'PUT', body: JSON.stringify({ content_payload: payload, client_updated_at_ms: item.updatedAt ?? item.createdAt }),
  });
}

export function deleteRemoteLibrary(workspaceId: string, kind: LibraryKind, id: string): Promise<void> {
  return requestNoContent(`${path(workspaceId, kind)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function cacheRemoteLibrary(kind: LibraryKind, remote: RemoteLibraryItem, workspaceId: string): Promise<void> {
  if (remote.workspace_id !== workspaceId || remote.kind !== kind) throw new Error('Library response scope mismatch');
  const table = libraryTable(kind);
  const existing = await table.get(remote.id);
  if (existing && existing.workspaceId !== workspaceId) throw new Error('Library cache identifier conflict');
  if (remote.is_deleted) {
    await table.delete(remote.id);
  } else {
    await table.put({ ...remote.content_payload, id: remote.id, workspaceId,
      updatedAt: remote.client_updated_at_ms, serverSyncedAt: Date.now() } as LibraryEntry);
  }
}
