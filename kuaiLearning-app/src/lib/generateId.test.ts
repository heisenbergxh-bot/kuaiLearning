import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateId } from './generateId';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateId', () => {
  it('uses randomUUID when the browser provides it', () => {
    const randomUUID = vi.fn(() => 'native-uuid');
    vi.stubGlobal('crypto', { randomUUID });

    expect(generateId()).toBe('native-uuid');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates an RFC 4122 v4 UUID when randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.forEach((_, index) => { bytes[index] = index; });
        return bytes;
      },
    });

    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('still creates a local key without Web Crypto', () => {
    vi.stubGlobal('crypto', undefined);

    expect(generateId()).toMatch(/^[a-z0-9]+-[a-z0-9]+-[a-z0-9]+$/);
  });
});
