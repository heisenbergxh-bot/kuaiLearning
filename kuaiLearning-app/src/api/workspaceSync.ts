import { db, deleteLocalWorkspaceData } from '../db';
import type { Workspace } from '../types';
import {
  listRemoteWorkspaces,
  upsertRemoteWorkspace,
  workspaceFromRemote,
} from './workspaces';

export async function synchronizeWorkspaceCache(localWorkspaces: Workspace[]): Promise<Workspace[]> {
  const remoteWorkspaces = await listRemoteWorkspaces();
  const localById = new Map(localWorkspaces.map(workspace => [workspace.id, workspace]));
  const synchronized = new Map<string, Workspace>();
  const deletedIds = new Set<string>();

  for (const remote of remoteWorkspaces) {
    if (remote.status === 'deleted') {
      deletedIds.add(remote.id);
      continue;
    }
    const local = localById.get(remote.id);
    const remoteClientTimestamp = remote.client_updated_at_ms ?? 0;
    if (local && local.updatedAt > remoteClientTimestamp) {
      const saved = await upsertRemoteWorkspace(local);
      synchronized.set(local.id, workspaceFromRemote(saved));
    } else {
      synchronized.set(remote.id, workspaceFromRemote(remote));
    }
  }

  // Local workspaces absent from this account's server list may belong to a
  // different account. Keep them on disk for recovery, but never display or
  // upload them under the current identity.
  const authorized = [...synchronized.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  await db.workspaces.bulkPut(authorized);
  await Promise.all([...deletedIds].map(id => deleteLocalWorkspaceData(id)));
  return authorized;
}
