import { redirectToLogin } from '../auth/navigation';
import { requestJson, requestNoContent } from './http';

export interface KnowledgeSource {
  id: string;
  workspace_id: string;
  title: string;
  source_type: string;
  original_filename: string;
  mime_type: string | null;
  byte_size: number;
  status: 'pending' | 'processing' | 'ready' | 'failed' | string;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSearchHit {
  chunk_id: string;
  source_id: string;
  source_title: string;
  page_number: number | null;
  content: string;
  score: number;
  matched_by: ('semantic' | 'keyword' | 'fallback')[];
  download_url: string;
}

export function listKnowledgeSources(workspaceId: string): Promise<KnowledgeSource[]> {
  return requestJson(`/api/v1/workspaces/${workspaceId}/knowledge/sources`);
}

export async function uploadKnowledgeSource(
  workspaceId: string,
  file: File,
  title?: string,
): Promise<KnowledgeSource> {
  const data = new FormData();
  data.append('file', file);
  if (title?.trim()) data.append('title', title.trim());
  const response = await fetch(`/api/v1/workspaces/${workspaceId}/knowledge/sources`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    body: data,
  });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(payload.detail || `上传失败（${response.status}）`);
  }
  return response.json() as Promise<KnowledgeSource>;
}

export function retryKnowledgeSource(workspaceId: string, sourceId: string): Promise<KnowledgeSource> {
  return requestJson(`/api/v1/workspaces/${workspaceId}/knowledge/sources/${sourceId}/retry`, {
    method: 'POST',
  });
}

export function deleteKnowledgeSource(workspaceId: string, sourceId: string): Promise<void> {
  return requestNoContent(`/api/v1/workspaces/${workspaceId}/knowledge/sources/${sourceId}`, {
    method: 'DELETE',
  });
}

export function searchKnowledge(
  workspaceId: string,
  query: string,
  limit = 8,
): Promise<KnowledgeSearchHit[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  return requestJson(`/api/v1/workspaces/${workspaceId}/knowledge/search?${params}`);
}

export function knowledgeContext(hits: KnowledgeSearchHit[]): string {
  return hits.map((hit, index) => {
    const page = hit.page_number ? `，第 ${hit.page_number} 页` : '';
    return `[资料${index + 1}] ${hit.source_title}${page}\n${hit.content}\n来源：${hit.download_url}`;
  }).join('\n\n');
}
