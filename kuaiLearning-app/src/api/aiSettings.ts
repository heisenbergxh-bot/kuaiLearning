import { requestJson } from './http';

export interface ServerAISettings {
  base_url: string;
  model: string;
  api_key_configured: boolean;
  source: 'database' | 'environment';
  can_edit: boolean;
}

export function readAISettings(): Promise<ServerAISettings> {
  return requestJson('/api/v1/settings/ai', { cache: 'no-store' });
}

export function saveAISettings(baseUrl: string, model: string, apiKey: string): Promise<ServerAISettings> {
  return requestJson('/api/v1/settings/ai', {
    method: 'PUT',
    body: JSON.stringify({
      base_url: baseUrl.trim(),
      model: model.trim(),
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
    }),
  });
}
