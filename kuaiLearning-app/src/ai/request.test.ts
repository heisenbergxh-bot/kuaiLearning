import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAI, fetchCompletion } from './request';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchAI', () => {
  it('routes completions through the authenticated backend without a browser API key', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await fetchCompletion('workspace/1', { method: 'POST', body: '{}' });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/workspaces/workspace%2F1/ai/completions');
    expect(fetch.mock.calls[0][1]?.credentials).toBe('include');
    expect(new Headers(fetch.mock.calls[0][1]?.headers).has('Authorization')).toBe(false);
  });
  it('retries retryable HTTP responses', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const request = fetchAI('https://example.test', {}, { retries: 1 });
    await vi.runAllTimersAsync();

    await expect(request).resolves.toMatchObject({ status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry ordinary client errors', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('bad request', { status: 400 }));

    await expect(fetchAI('https://example.test')).resolves.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('turns a timeout into a useful error', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => (
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })
    ));

    const request = fetchAI('https://example.test', {}, { timeoutMs: 100, retries: 0 });
    const rejection = expect(request).rejects.toThrow('AI request timed out after 100ms');
    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });
});
