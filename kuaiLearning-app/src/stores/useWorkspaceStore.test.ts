import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { db } from '../db';
import type { Workspace } from '../types';
import { upsertRemoteWorkspace } from '../api/workspaces';
import { useWorkspaceStore } from './useWorkspaceStore';
import { synchronizeWorkspaceCache } from '../api/workspaceSync';

vi.mock('../api/workspaces', () => ({
  deleteRemoteWorkspace: vi.fn(),
  upsertRemoteWorkspace: vi.fn(),
}));
vi.mock('../api/workspaceSync', () => ({ synchronizeWorkspaceCache: vi.fn() }));

const workspace: Workspace = {
  id: 'deleted-workspace',
  name: '事务学习',
  mission: { topic: '事务', why: '', successLooksLike: [], constraints: '', outOfScope: '' },
  notes: '',
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
  await db.workspaces.add(workspace);
  useWorkspaceStore.setState({
    workspaces: [workspace],
    activeId: workspace.id,
    loading: false,
    initialized: true,
    syncError: null,
  });
  vi.clearAllMocks();
});

describe('workspace mission updates', () => {
  it('surfaces a deleted-workspace conflict so the UI can offer recovery', async () => {
    vi.mocked(upsertRemoteWorkspace).mockRejectedValue(
      new ApiError('Workspace was deleted', 409),
    );

    await expect(useWorkspaceStore.getState().updateMission(workspace.id, {
      ...workspace.mission,
      why: '减少生产事故',
    })).rejects.toMatchObject({ status: 409 });

    expect(useWorkspaceStore.getState().syncError).toBe('Workspace was deleted');
    await expect(db.workspaces.get(workspace.id)).resolves.toMatchObject({
      mission: expect.objectContaining({ why: '减少生产事故' }),
    });
  });
});

describe('workspace account isolation', () => {
  it('hides cached workspaces until the server confirms the current account', async () => {
    let resolveSync!: (workspaces: Workspace[]) => void;
    vi.mocked(synchronizeWorkspaceCache).mockImplementation(() => new Promise(resolve => { resolveSync = resolve; }));

    const loading = useWorkspaceStore.getState().loadWorkspaces();
    expect(useWorkspaceStore.getState()).toMatchObject({
      workspaces: [],
      activeId: null,
      loading: true,
      initialized: false,
    });

    await vi.waitFor(() => expect(synchronizeWorkspaceCache).toHaveBeenCalled());
    resolveSync([]);
    await loading;
    expect(useWorkspaceStore.getState()).toMatchObject({
      workspaces: [],
      activeId: null,
      loading: false,
      initialized: true,
      syncError: null,
    });
  });
});
