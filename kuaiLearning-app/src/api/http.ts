import { redirectToLogin } from '../auth/navigation';

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function errorFromResponse(response: Response): Promise<ApiError> {
  let detail = `请求失败（${response.status}）`;
  try {
    const payload = (await response.json()) as { detail?: string };
    if (payload.detail) detail = payload.detail;
  } catch {
    // Keep the status-based fallback when an upstream returns non-JSON.
  }
  return new ApiError(detail, response.status);
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw await errorFromResponse(response);
  }
  return (await response.json()) as T;
}

export async function requestNoContent(path: string, init: RequestInit): Promise<void> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { Accept: 'application/json', ...init.headers },
  });
  if (response.status === 404) return;
  if (!response.ok) {
    if (response.status === 401) redirectToLogin();
    throw await errorFromResponse(response);
  }
}
