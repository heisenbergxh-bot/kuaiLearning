const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface AIRequestOptions {
  timeoutMs?: number;
  retries?: number;
}

function retryDelay(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 4_000);
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchAI(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: AIRequestOptions = {},
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;

  for (let attempt = 0; ; attempt += 1) {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    try {
      const response = await fetch(input, { ...init, signal });
      if (!RETRYABLE_STATUS.has(response.status) || attempt >= retries) {
        return response;
      }
      await response.body?.cancel();
    } catch (error) {
      if (init.signal?.aborted) throw error;
      if (attempt >= retries) {
        if (timeoutController.signal.aborted) {
          throw new Error(`AI request timed out after ${timeoutMs}ms`, { cause: error });
        }
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
    }

    await wait(retryDelay(attempt));
  }
}
