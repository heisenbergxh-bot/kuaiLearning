// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerAISettings } from './ServerAISettings';
import { readAISettings, saveAISettings } from '../api/aiSettings';
import { ApiError } from '../api/http';

vi.mock('../api/aiSettings', () => ({ readAISettings: vi.fn(), saveAISettings: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const configuration = {
  base_url: 'https://example.com/v1', model: 'model', api_key_configured: true,
  source: 'database' as const, can_edit: true,
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  vi.mocked(readAISettings).mockResolvedValue(configuration);
  vi.mocked(saveAISettings).mockResolvedValue(configuration);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render() {
  await act(async () => root.render(<ServerAISettings />));
}
async function submit() {
  await act(async () => container.querySelector('form')!.dispatchEvent(
    new Event('submit', { bubbles: true, cancelable: true }),
  ));
}

describe('server AI settings', () => {
  it('loads shared settings and preserves the saved key on a blank submission', async () => {
    await render();
    expect((container.querySelector('#server-ai-url') as HTMLInputElement).value).toBe(configuration.base_url);
    expect((container.querySelector('#server-ai-key') as HTMLInputElement).value).toBe('');
    await submit();
    expect(saveAISettings).toHaveBeenCalledWith(configuration.base_url, configuration.model, '');
    expect(container.textContent).toContain('已保存，大纲、课程和聊天均使用此配置');
    expect(localStorage.length).toBe(0);
  });

  it('does not offer editing to a non-administrator', async () => {
    vi.mocked(readAISettings).mockResolvedValue({ ...configuration, can_edit: false });
    await render();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(container.querySelector('fieldset')!.disabled).toBe(true);
    await submit();
    expect(saveAISettings).not.toHaveBeenCalled();
  });

  it('requires a key when creating the first database configuration', async () => {
    vi.mocked(readAISettings).mockResolvedValue({ ...configuration, source: 'environment' });
    await render();
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('#server-ai-key') as HTMLInputElement).required).toBe(true);
  });

  it('shows a retry action after a read failure', async () => {
    vi.mocked(readAISettings).mockRejectedValueOnce(new Error('offline'));
    await render();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => container.querySelector('button')!.click());
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('shows save failure without claiming success or exposing raw errors', async () => {
    vi.mocked(saveAISettings).mockRejectedValue(new ApiError('sensitive-upstream-error', 503));
    await render();
    await submit();
    expect(container.textContent).toContain('服务器配置服务暂不可用');
    expect(container.textContent).not.toContain('sensitive-upstream-error');
    expect(container.textContent).not.toContain('已保存，大纲');
  });
});
