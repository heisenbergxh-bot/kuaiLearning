import type { Mission, Workspace } from '../types';
import { requestJson, requestNoContent } from './http';

interface RemoteMission {
  topic: string;
  why: string;
  success_looks_like: string[];
  constraints: string;
  out_of_scope: string;
}

interface RemoteWorkspaceContent {
  schema_version: 1;
  mission: RemoteMission;
  notes: string;
}

export interface RemoteWorkspace {
  id: string;
  title: string;
  learning_goal: string;
  status: string;
  context_snapshot: Record<string, unknown> | null;
  content_payload: RemoteWorkspaceContent;
  client_updated_at_ms: number | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceWrite {
  title: string;
  learning_goal: string;
  content_payload: RemoteWorkspaceContent;
  client_updated_at_ms: number;
}

function toRemoteMission(mission: Mission): RemoteMission {
  return {
    topic: mission.topic,
    why: mission.why,
    success_looks_like: mission.successLooksLike,
    constraints: mission.constraints,
    out_of_scope: mission.outOfScope,
  };
}

function toWorkspaceWrite(workspace: Workspace): WorkspaceWrite {
  return {
    title: workspace.name,
    learning_goal: workspace.mission.topic || workspace.name,
    content_payload: {
      schema_version: 1,
      mission: toRemoteMission(workspace.mission),
      notes: workspace.notes,
    },
    client_updated_at_ms: workspace.updatedAt,
  };
}

export async function listRemoteWorkspaces(): Promise<RemoteWorkspace[]> {
  const pageSize = 100;
  const result: RemoteWorkspace[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await requestJson<RemoteWorkspace[]>(
      `/api/v1/workspaces?limit=${pageSize}&offset=${offset}`,
    );
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

export function workspaceFromRemote(remote: RemoteWorkspace): Workspace {
  const mission = remote.content_payload?.mission;
  const createdAt = Date.parse(remote.created_at);
  const updatedAt = remote.client_updated_at_ms ?? Date.parse(remote.updated_at);
  return {
    id: remote.id,
    name: remote.title,
    mission: {
      topic: mission?.topic || remote.learning_goal,
      why: mission?.why || '',
      successLooksLike: mission?.success_looks_like || [],
      constraints: mission?.constraints || '',
      outOfScope: mission?.out_of_scope || '',
    },
    notes: remote.content_payload?.notes || '',
    createdAt: Number.isFinite(createdAt) ? createdAt : updatedAt,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

export async function upsertRemoteWorkspace(workspace: Workspace): Promise<RemoteWorkspace> {
  return requestJson<RemoteWorkspace>(`/api/v1/workspaces/${encodeURIComponent(workspace.id)}`, {
    method: 'PUT',
    body: JSON.stringify(toWorkspaceWrite(workspace)),
  });
}

export async function deleteRemoteWorkspace(id: string): Promise<void> {
  await requestNoContent(`/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
