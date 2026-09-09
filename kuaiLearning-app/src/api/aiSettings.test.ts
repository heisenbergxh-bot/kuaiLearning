import { afterEach, expect, it, vi } from 'vitest';
import { saveAISettings } from './aiSettings';

afterEach(() => vi.unstubAllGlobals());

it('omits a blank API key and includes cookies when saving', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await saveAISettings(' https://model.example/v1 ', ' model ', '  ');
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe('/api/v1/settings/ai');
  expect(options.credentials).toBe('include');
  expect(JSON.parse(options.body)).toEqual({ base_url: 'https://model.example/v1', model: 'model' });
});

it('sends an explicitly entered replacement key', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  await saveAISettings('https://model.example/v1', 'model', ' new-key ');
  expect(JSON.parse(fetch.mock.calls[0][1].body).api_key).toBe('new-key');
});
