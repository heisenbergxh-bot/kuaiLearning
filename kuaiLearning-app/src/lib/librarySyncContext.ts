import { createContext, useContext } from 'react';
import type { LibraryKind } from '../api/library';

export interface SyncState {
  status: 'local' | 'syncing' | 'synced' | 'error';
  revision: number;
  refresh: () => Promise<boolean>;
  remove: (kind: LibraryKind, id: string) => Promise<boolean>;
}
const fallback: SyncState = { status: 'local', revision: 0, refresh: async () => false, remove: async () => false };
export const LibrarySyncContext = createContext<SyncState>(fallback);
export function useLibrarySync() { return useContext(LibrarySyncContext); }
