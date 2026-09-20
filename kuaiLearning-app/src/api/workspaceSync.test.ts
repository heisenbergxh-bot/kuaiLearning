import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Workspace } from '../types';
import { synchronizeWorkspaceCache } from './workspaceSync';
import {
  listRemoteWorkspaces,
  upsertRemoteWorkspace,
  type RemoteWorkspace,
} from './workspaces';

vi.mock('./workspaces', async importOriginal => {
  const original = await importOriginal<typeof import('./workspaces')>();
  return {
    ...original,
    listRemoteWorkspaces: vi.fn(),
    upsertRemoteWorkspace: vi.fn(),
  };
});

const localWorkspace: Workspace = {
  id: 'workspace-1',
  name: '旧浏览器副本',
  mission: {
    topic: 'Python',
    why: '',
    successLooksLike: [],
    constraints: '',
    outOfScope: '',
  },
  notes: '',
  createdAt: 1000,
  updatedAt: 2000,
};

const deletedRemote: RemoteWorkspace = {
  id: 'workspace-1',
  title: '已删除',
  learning_goal: 'Python',
  status: 'deleted',
  context_snapshot: null,
  content_payload: {
    schema_version: 1,
    mission: {
      topic: 'Python',
      why: '',
      success_looks_like: [],
      constraints: '',
      out_of_scope: '',
    },
    notes: '',
  },
  client_updated_at_ms: 2000,
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
};

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  vi.clearAllMocks();
});

describe('workspace synchronization', () => {
  it('keeps an unclaimed local workspace private when the account has no server copy', async () => {
    vi.mocked(listRemoteWorkspaces).mockResolvedValue([]);
    await db.workspaces.add(localWorkspace);

    const result = await synchronizeWorkspaceCache([localWorkspace]);

    expect(upsertRemoteWorkspace).not.toHaveBeenCalled();
    expect(result).toEqual([]);
    await expect(db.workspaces.get(localWorkspace.id)).resolves.toBeDefined();
  });

  it('uploads a newer local copy only after the server confirms ownership', async () => {
    vi.mocked(listRemoteWorkspaces).mockResolvedValue([{ ...deletedRemote, status: 'active', client_updated_at_ms: 1000 }]);
    vi.mocked(upsertRemoteWorkspace).mockResolvedValue({ ...deletedRemote, status: 'active', title: localWorkspace.name });

    const result = await synchronizeWorkspaceCache([localWorkspace]);

    expect(upsertRemoteWorkspace).toHaveBeenCalledWith(localWorkspace);
    expect(result).toHaveLength(1);
  });

  it('honors a server tombstone instead of resurrecting a stale browser copy', async () => {
    await db.workspaces.add(localWorkspace);
    vi.mocked(listRemoteWorkspaces).mockResolvedValue([deletedRemote]);

    const result = await synchronizeWorkspaceCache([localWorkspace]);

    expect(result).toEqual([]);
    expect(upsertRemoteWorkspace).not.toHaveBeenCalled();
    await expect(db.workspaces.get(localWorkspace.id)).resolves.toBeUndefined();
  });
});
