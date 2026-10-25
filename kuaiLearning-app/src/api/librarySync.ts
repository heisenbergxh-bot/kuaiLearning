import { synchronizeLearningContent } from './learningContentSync';
import {
  cacheRemoteLibrary, deleteRemoteLibrary, libraryKinds, libraryTable,
  listRemoteLibrary, upsertRemoteLibrary,
} from './library';
import type { LibraryKind } from './library';

const jobs = new Map<string, Promise<void>>();
function enqueue(workspaceId: string, operation: () => Promise<void>): Promise<void> {
  const previous = jobs.get(workspaceId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  jobs.set(workspaceId, next);
  const cleanup = () => { if (jobs.get(workspaceId) === next) jobs.delete(workspaceId); };
  void next.then(cleanup, cleanup);
  return next;
}

async function synchronize(workspaceId: string): Promise<void> {
  const failures: unknown[] = [];
  for (const kind of libraryKinds) {
    const remoteItems = await listRemoteLibrary(workspaceId, kind);
    const localItems = await libraryTable(kind).where('workspaceId').equals(workspaceId).toArray();
    const localById = new Map(localItems.map(item => [item.id, item]));
    const remoteIds = new Set(remoteItems.map(item => item.id));
    for (const remote of remoteItems) {
      const local = localById.get(remote.id);
      try {
        if (!remote.is_deleted && local && (local.updatedAt ?? local.createdAt) > remote.client_updated_at_ms) {
          await cacheRemoteLibrary(kind, await upsertRemoteLibrary(kind, local), workspaceId);
        } else {
          await cacheRemoteLibrary(kind, remote, workspaceId);
        }
      } catch (error) { failures.push(error); }
    }
    // Legacy browser-only entries are uploaded with their original IDs, exactly once.
    for (const local of localItems) {
      if (remoteIds.has(local.id)) continue;
      try { await cacheRemoteLibrary(kind, await upsertRemoteLibrary(kind, local), workspaceId); }
      catch (error) { failures.push(error); }
    }
  }
  if (failures.length) throw new Error(`${failures.length} library item(s) could not be synchronized`, { cause: failures[0] });
}

export function synchronizeLibrary(workspaceId: string, beforeSync?: () => Promise<void>): Promise<void> {
  return enqueue(workspaceId, async () => {
    await beforeSync?.();
    await synchronize(workspaceId);
  });
}

export function synchronizeWorkspaceLibrary(workspaceId: string): Promise<void> {
  return enqueue(workspaceId, async () => {
    // Restore/upload parent lessons first, then their derived entries.
    await synchronizeLearningContent(workspaceId);
    await synchronize(workspaceId);
  });
}

export function removeLibraryItem(workspaceId: string, kind: LibraryKind, id: string): Promise<void> {
  return enqueue(workspaceId, async () => {
    const local = await libraryTable(kind).get(id);
    if (local && local.workspaceId !== workspaceId) throw new Error('Library item scope mismatch');
    // Server first: a failed deletion leaves the local copy intact for retry.
    await deleteRemoteLibrary(workspaceId, kind, id);
    await libraryTable(kind).delete(id);
  });
}
