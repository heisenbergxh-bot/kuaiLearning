import { db, deleteLocalWorkspaceData } from '../db';
import type { Workspace } from '../types';
import {
  listRemoteWorkspaces,
  upsertRemoteWorkspace,
  workspaceFromRemote,
} from './workspaces';

export async function synchronizeWorkspaceCache(localWorkspaces: Workspace[]): Promise<Workspace[]> {
  const remoteWorkspaces = await listRemoteWorkspaces();
  const remoteById = new Map(remoteWorkspaces.map(workspace => [workspace.id, workspace]));
  const merged = new Map(localWorkspaces.map(workspace => [workspace.id, workspace]));
  const deletedIds = new Set<string>();

  for (const remote of remoteWorkspaces) {
    if (remote.status === 'deleted') {
      merged.delete(remote.id);
      deletedIds.add(remote.id);
      continue;
    }
    const local = merged.get(remote.id);
    const remoteClientTimestamp = remote.client_updated_at_ms ?? 0;
    if (!local || remoteClientTimestamp > local.updatedAt) {
      merged.set(remote.id, workspaceFromRemote(remote));
    }
  }

  for (const local of localWorkspaces) {
    const remote = remoteById.get(local.id);
    if (deletedIds.has(local.id)) continue;
    if (!remote || local.updatedAt > (remote.client_updated_at_ms ?? 0)) {
      const saved = await upsertRemoteWorkspace(local);
      merged.set(local.id, workspaceFromRemote(saved));
    }
  }

  const synchronized = [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  await db.workspaces.bulkPut(synchronized);
  await Promise.all([...deletedIds].map(id => deleteLocalWorkspaceData(id)));
  return synchronized;
}
