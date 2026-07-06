import { create } from 'zustand';
import type { Workspace } from '../types';
import { db, generateId } from '../db';

interface WorkspaceState {
  workspaces: Workspace[];
  activeId: string | null;
  loading: boolean;

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

  loadWorkspaces: async () => {
    set({ loading: true });
    const workspaces = await db.workspaces.orderBy('updatedAt').reverse().toArray();
    const activeId = get().activeId || workspaces[0]?.id || null;
    set({ workspaces, activeId, loading: false });
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
    return ws;
  },

  deleteWorkspace: async (id: string) => {
    // Collect lesson ids first so we can clean up lesson-scoped tables.
    const lessonIds = (await db.lessons.where('workspaceId').equals(id).primaryKeys()) as string[];

    await db.workspaces.delete(id);
    await db.lessons.where('workspaceId').equals(id).delete();
    await db.learningRecords.where('workspaceId').equals(id).delete();
    await db.glossaryTerms.where('workspaceId').equals(id).delete();
    await db.resources.where('workspaceId').equals(id).delete();
    await db.references.where('workspaceId').equals(id).delete();
    await db.quizQuestions.where('workspaceId').equals(id).delete();
    await db.syllabusItems.where('workspaceId').equals(id).delete();
    if (lessonIds.length > 0) {
      await db.chatMessages.where('lessonId').anyOf(lessonIds).delete();
    }

    const workspaces = get().workspaces.filter(w => w.id !== id);
    const activeId = get().activeId === id ? (workspaces[0]?.id || null) : get().activeId;
    set({ workspaces, activeId });
  },

  setActive: (id: string) => set({ activeId: id }),

  updateMission: async (id: string, mission: Workspace['mission']) => {
    await db.workspaces.update(id, { mission, updatedAt: Date.now() });
    const workspaces = get().workspaces.map(w => w.id === id ? { ...w, mission, updatedAt: Date.now() } : w);
    set({ workspaces });
  },

  updateNotes: async (id: string, notes: string) => {
    await db.workspaces.update(id, { notes, updatedAt: Date.now() });
    const workspaces = get().workspaces.map(w => w.id === id ? { ...w, notes, updatedAt: Date.now() } : w);
    set({ workspaces });
  },
}));
