import { create } from 'zustand';
import type { Workspace } from '../types';
import { db, deleteLocalWorkspaceData, generateId } from '../db';
import { deleteRemoteWorkspace, upsertRemoteWorkspace } from '../api/workspaces';
import { synchronizeWorkspaceCache } from '../api/workspaceSync';
import { ApiError } from '../api/http';

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  loading: boolean;
  initialized: boolean;
  syncError: string | null;

  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  setActive: (id: string) => void;
  updateMission: (id: string, mission: Workspace['mission']) => Promise<void>;
  updateNotes: (id: string, notes: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  loading: false,
  initialized: false,
  syncError: null,

  loadWorkspaces: async () => {
    // Never expose the shared browser cache before the server confirms which
    // workspaces belong to the currently authenticated account.
    set({ workspaces: [], activeId: null, loading: true, initialized: false, syncError: null });
    const localWorkspaces = await db.workspaces.orderBy('updatedAt').reverse().toArray();
    try {
      const workspaces = await synchronizeWorkspaceCache(localWorkspaces);
      const previousActiveId = get().activeId;
      const activeId = workspaces.some(item => item.id === previousActiveId)
        ? previousActiveId
        : workspaces[0]?.id || null;
      set({ workspaces, activeId, loading: false, initialized: true, syncError: null });
    } catch (reason) {
      set({ workspaces: [], activeId: null, loading: false, initialized: true, syncError: syncErrorMessage(reason) });
    }
  },

  createWorkspace: async (name: string) => {
    const now = Date.now();
    const ws: Workspace = {
      id: generateId(),
      name,
      mission: { topic: '', why: '', successLooksLike: [], constraints: '', outOfScope: '' },
      notes: '',
      createdAt: now,
      updatedAt: now,
    };
    await db.workspaces.add(ws);
    const workspaces = [...get().workspaces, ws];
    set({ workspaces, activeId: ws.id });
    try {
      await upsertRemoteWorkspace(ws);
      set({ syncError: null });
    } catch (reason) {
      set({ syncError: syncErrorMessage(reason) });
      if (reason instanceof ApiError && reason.status === 409) throw reason;
    }
    return ws;
  },

  deleteWorkspace: async (id: string) => {
    try {
      await deleteRemoteWorkspace(id);
    } catch (reason) {
      set({ syncError: syncErrorMessage(reason) });
      throw reason;
    }

    await deleteLocalWorkspaceData(id);

    const workspaces = get().workspaces.filter(w => w.id !== id);
    const activeId = get().activeId === id ? (workspaces[0]?.id || null) : get().activeId;
    set({ workspaces, activeId, syncError: null });
  },

  setActive: (id: string) => set({ activeId: id }),

  updateMission: async (id: string, mission: Workspace['mission']) => {
    const updatedAt = Date.now();
    await db.workspaces.update(id, { mission, updatedAt });
    const workspaces = get().workspaces.map(w => w.id === id ? { ...w, mission, updatedAt } : w);
    set({ workspaces });
    const workspace = workspaces.find(item => item.id === id);
    if (!workspace) return;
    try {
      await upsertRemoteWorkspace(workspace);
      set({ syncError: null });
    } catch (reason) {
      set({ syncError: syncErrorMessage(reason) });
      if (reason instanceof ApiError && reason.status === 409) throw reason;
    }
  },

  updateNotes: async (id: string, notes: string) => {
    const updatedAt = Date.now();
    await db.workspaces.update(id, { notes, updatedAt });
    const workspaces = get().workspaces.map(w => w.id === id ? { ...w, notes, updatedAt } : w);
    set({ workspaces });
    const workspace = workspaces.find(item => item.id === id);
    if (!workspace) return;
    try {
      await upsertRemoteWorkspace(workspace);
      set({ syncError: null });
    } catch (reason) {
      set({ syncError: syncErrorMessage(reason) });
    }
  },
}));

function syncErrorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : '工作区同步失败';
}
