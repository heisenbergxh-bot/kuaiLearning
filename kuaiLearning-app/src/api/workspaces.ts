import type { Mission, Workspace } from '../types';
import { redirectToLogin } from '../auth/navigation';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    let detail = `请求失败（${response.status}）`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) detail = payload.detail;
    } catch {
      // Keep the status-based fallback when an upstream returns non-JSON.
    }
    throw new ApiError(detail, response.status);
  }
  return (await response.json()) as T;
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
  const response = await fetch(`/api/v1/workspaces/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return;
  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw new ApiError(`删除失败（${response.status}）`, response.status);
}
