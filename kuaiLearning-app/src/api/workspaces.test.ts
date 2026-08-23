import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../types';
import {
  deleteRemoteWorkspace,
  listRemoteWorkspaces,
  upsertRemoteWorkspace,
  workspaceFromRemote,
  type RemoteWorkspace,
} from './workspaces';

const remoteWorkspace: RemoteWorkspace = {
  id: 'workspace-1',
  title: '学习 TypeScript',
  learning_goal: 'TypeScript',
  status: 'active',
  context_snapshot: { job_grade: 'B6' },
  content_payload: {
    schema_version: 1,
    mission: {
      topic: 'TypeScript',
      why: '交付前端项目',
      success_looks_like: ['完成应用'],
      constraints: '每周三小时',
      out_of_scope: '编译器源码',
    },
    notes: '云端笔记',
  },
  client_updated_at_ms: 2000,
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('workspace API', () => {
  it('maps the server payload back to the legacy local model', () => {
    expect(workspaceFromRemote(remoteWorkspace)).toEqual({
      id: 'workspace-1',
      name: '学习 TypeScript',
      mission: {
        topic: 'TypeScript',
        why: '交付前端项目',
        successLooksLike: ['完成应用'],
        constraints: '每周三小时',
        outOfScope: '编译器源码',
      },
      notes: '云端笔记',
      createdAt: Date.parse('2026-08-23T00:00:00Z'),
      updatedAt: 2000,
    });
  });

  it('upserts browser-owned fields with credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(remoteWorkspace), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const local: Workspace = {
      id: 'workspace-1',
      name: '学习 TypeScript',
      mission: {
        topic: 'TypeScript',
        why: '交付前端项目',
        successLooksLike: ['完成应用'],
        constraints: '每周三小时',
        outOfScope: '编译器源码',
      },
      notes: '云端笔记',
      createdAt: 1000,
      updatedAt: 2000,
    };

    await upsertRemoteWorkspace(local);

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/workspaces/workspace-1', expect.objectContaining({
      method: 'PUT',
      credentials: 'include',
    }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.content_payload.mission.success_looks_like).toEqual(['完成应用']);
    expect(body).not.toHaveProperty('context_snapshot');
  });

  it('lists workspaces and treats an already absent delete as successful', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([remoteWorkspace]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listRemoteWorkspaces()).resolves.toEqual([remoteWorkspace]);
    await expect(deleteRemoteWorkspace('workspace-1')).resolves.toBeUndefined();
  });
});
