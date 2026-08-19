import { describe, it, expect } from 'vitest';
import { LESSON_THEMES, getLessonTheme, themeVarsPromptLine, DEFAULT_LESSON_THEME_ID } from './lessonThemes';

describe('lessonThemes', () => {
  it('offers at least 20 themes with unique ids and complete vars', () => {
    expect(LESSON_THEMES.length).toBeGreaterThanOrEqual(20);
    const ids = new Set(LESSON_THEMES.map(t => t.id));
    expect(ids.size).toBe(LESSON_THEMES.length);
    for (const t of LESSON_THEMES) {
      for (const v of Object.values(t.vars)) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(t.name.zh).toBeTruthy();
      expect(t.name.en).toBeTruthy();
      expect(t.styleHint).toBeTruthy();
    }
  });

  it('falls back to the default theme for unknown ids', () => {
    expect(getLessonTheme(undefined).id).toBe(DEFAULT_LESSON_THEME_ID);
    expect(getLessonTheme('nope').id).toBe(DEFAULT_LESSON_THEME_ID);
    expect(getLessonTheme('sakura').id).toBe('sakura');
  });

  it('renders a :root line containing every var', () => {
    const line = themeVarsPromptLine(getLessonTheme('celadon'));
    for (const key of ['--bg', '--bg-card', '--text', '--text-heading', '--text-muted', '--border', '--accent', '--accent-light', '--accent-border']) {
      expect(line).toContain(key);
    }
  });
});
