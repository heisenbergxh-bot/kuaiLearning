// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MissionChat } from './MissionChat';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  container.style.transform = 'translateX(0)';
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('mission creation dialog', () => {
  it('renders at the document root instead of inside a transformed sidebar', async () => {
    await act(async () => root.render(
      <MemoryRouter>
        <MissionChat open onClose={() => undefined} />
      </MemoryRouter>,
    ));

    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(dialog?.parentElement).toBe(document.body);
  });
});
