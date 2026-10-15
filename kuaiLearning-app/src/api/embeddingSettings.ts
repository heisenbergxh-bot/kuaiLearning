import { requestJson } from './http';

export interface EmbeddingConfiguration {
  provider: 'openai' | 'local';
  base_url: string;
  model: string;
  dimensions: number;
  api_key_configured: boolean;
  source: 'database' | 'environment';
  can_edit: boolean;
  knowledge_source_count: number;
}

export interface EmbeddingSettingsInput {
  provider: 'openai' | 'local';
  base_url: string;
  model: string;
  dimensions: number;
  api_key?: string;
  clear_api_key?: boolean;
}

export function readEmbeddingSettings(): Promise<EmbeddingConfiguration> {
  return requestJson('/api/v1/settings/embedding', { cache: 'no-store' });
}

export function saveEmbeddingSettings(payload: EmbeddingSettingsInput): Promise<EmbeddingConfiguration> {
  return requestJson('/api/v1/settings/embedding', { method: 'PUT', body: JSON.stringify(payload) });
}

export function testEmbeddingSettings(payload: EmbeddingSettingsInput): Promise<{ ok: boolean; dimensions: number }> {
  return requestJson('/api/v1/settings/embedding/test', { method: 'POST', body: JSON.stringify(payload) });
}
