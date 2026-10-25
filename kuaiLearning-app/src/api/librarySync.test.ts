import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import {
  libraryKinds, libraryTable, listRemoteLibrary, upsertRemoteLibrary, deleteRemoteLibrary,
  type RemoteLibraryItem, type LibraryEntry,
} from './library';
import { removeLibraryItem, synchronizeLibrary, synchronizeWorkspaceLibrary } from './librarySync';
import { synchronizeLearningContent } from './learningContentSync';

vi.mock('./learningContentSync', () => ({ synchronizeLearningContent: vi.fn(async () => {}) }));
vi.mock('./library', async importOriginal => ({
  ...await importOriginal<typeof import('./library')>(),
  listRemoteLibrary: vi.fn(), upsertRemoteLibrary: vi.fn(), deleteRemoteLibrary: vi.fn(),
}));

const workspace = 'workspace';
const entries: LibraryEntry[] = [
  { id: 'reference', workspaceId: workspace, createdAt: 1000, sourceLessonId: 'lesson',
    title: '速查资料', htmlContent: '<p>完整正文</p>' },
  { id: 'term', workspaceId: workspace, createdAt: 1000, sourceLessonId: 'lesson',
    term: '事务', definition: '全部成功或全部失败', avoid: ['部分提交'] },
  { id: 'record', workspaceId: workspace, createdAt: 1000, sourceLessonId: 'lesson',
    number: 1, title: '记录', content: '学到了事务', status: 'active', evidence: '例子' },
];
let server: Map<string, RemoteLibraryItem>;

beforeEach(async () => {
  vi.clearAllMocks();
  for (const table of db.tables) await table.clear();
  server = new Map();
  vi.mocked(listRemoteLibrary).mockImplementation(async (workspaceId, kind) =>
    structuredClone([...server.values()].filter(item => item.workspace_id === workspaceId && item.kind === kind)));
  vi.mocked(upsertRemoteLibrary).mockImplementation(async (kind, item) => {
    const existing = server.get(item.id);
    if (existing?.is_deleted) return structuredClone(existing);
    const { id, workspaceId, updatedAt, serverSyncedAt: _synced, ...content } = item;
    const remote: RemoteLibraryItem = { id, workspace_id: workspaceId, kind,
      content_payload: content, client_updated_at_ms: updatedAt ?? item.createdAt, is_deleted: false };
    server.set(id, remote);
    return structuredClone(remote);
  });
  vi.mocked(deleteRemoteLibrary).mockImplementation(async (workspaceId, kind, id) => {
    server.set(id, { id, workspace_id: workspaceId, kind, content_payload: {},
      client_updated_at_ms: 0, is_deleted: true });
  });
});

async function seedLegacy() {
  for (const [index, kind] of libraryKinds.entries()) await libraryTable(kind).add(entries[index]);
}

describe('library synchronization across devices', () => {
  it('backfills all legacy kinds once and restores full content to an empty browser', async () => {
    await seedLegacy();
    await synchronizeWorkspaceLibrary(workspace);
    expect(synchronizeLearningContent).toHaveBeenCalledWith(workspace);
    expect(upsertRemoteLibrary).toHaveBeenCalledTimes(3);
    await synchronizeWorkspaceLibrary(workspace);
    expect(upsertRemoteLibrary).toHaveBeenCalledTimes(3);
    // A second browser starts with no IndexedDB records.
    for (const kind of libraryKinds) await libraryTable(kind).clear();
    await synchronizeWorkspaceLibrary(workspace);
    for (const [index, kind] of libraryKinds.entries()) {
      expect(await libraryTable(kind).get(entries[index].id)).toMatchObject(entries[index]);
      expect((await libraryTable(kind).get(entries[index].id))?.serverSyncedAt).toBeGreaterThan(0);
    }
  });

  it('propagates deletions to an old browser without uploading its stale copy', async () => {
    await seedLegacy();
    await synchronizeLibrary(workspace);
    await removeLibraryItem(workspace, 'glossary', 'term');
    expect(await db.glossaryTerms.get('term')).toBeUndefined();
    await db.glossaryTerms.put(entries[1] as Parameters<typeof db.glossaryTerms.put>[0]);
    vi.mocked(upsertRemoteLibrary).mockClear();
    await synchronizeLibrary(workspace);
    expect(await db.glossaryTerms.get('term')).toBeUndefined();
    expect(upsertRemoteLibrary).not.toHaveBeenCalled();
  });

  it('retains local content on upload/deletion failure and retries successfully', async () => {
    await seedLegacy();
    vi.mocked(upsertRemoteLibrary).mockRejectedValueOnce(new Error('offline'));
    await expect(synchronizeLibrary(workspace)).rejects.toThrow('could not be synchronized');
    expect(await db.references.get('reference')).toEqual(entries[0]);
    expect(server.size).toBe(2);
    await synchronizeLibrary(workspace);
    expect(server.size).toBe(3);
    vi.mocked(deleteRemoteLibrary).mockRejectedValueOnce(new Error('offline'));
    await expect(removeLibraryItem(workspace, 'references', 'reference')).rejects.toThrow('offline');
    expect(await db.references.get('reference')).toBeDefined();
    expect(server.get('reference')?.is_deleted).toBe(false);
    await removeLibraryItem(workspace, 'references', 'reference');
    expect(await db.references.get('reference')).toBeUndefined();
  });

  it('serializes parent creation and includes entries added during a previous sync', async () => {
    const order: string[] = [];
    const first = synchronizeLibrary(workspace, async () => {
      order.push('parent');
      await seedLegacy();
    });
    const second = synchronizeLibrary(workspace, async () => {
      order.push('next');
      expect(server.size).toBe(3);
      await db.references.add({ ...entries[0], id: 'next-reference' } as Parameters<typeof db.references.add>[0]);
    });
    await Promise.all([first, second]);
    expect(order).toEqual(['parent', 'next']);
    expect(server.size).toBe(4);
  });
});
