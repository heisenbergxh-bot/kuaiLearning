import { JSDOM } from 'jsdom';
import { beforeAll, describe, it, expect } from 'vitest';
import { extractToc, tocHeadingId } from './extractToc';

beforeAll(() => {
  globalThis.DOMParser = new JSDOM().window.DOMParser;
});

describe('extractToc', () => {
  it('extracts h1–h3 in document order with sequential ids', () => {
    const html = '<h1>Title</h1><p>x</p><h2>Section A</h2><h3>Sub A1</h3><h2>Section B</h2>';
    const toc = extractToc(html);
    expect(toc).toEqual([
      { id: tocHeadingId(0), text: 'Title', level: 1 },
      { id: tocHeadingId(1), text: 'Section A', level: 2 },
      { id: tocHeadingId(2), text: 'Sub A1', level: 3 },
      { id: tocHeadingId(3), text: 'Section B', level: 2 },
    ]);
  });

  it('skips empty headings without breaking id sequence', () => {
    const html = '<h2>One</h2><h2>   </h2><h3>Two</h3>';
    const toc = extractToc(html);
    expect(toc.map(t => t.text)).toEqual(['One', 'Two']);
    expect(toc[1].id).toBe(tocHeadingId(1));
  });

  it('returns [] for empty or heading-less content', () => {
    expect(extractToc('')).toEqual([]);
    expect(extractToc('<p>no headings</p>')).toEqual([]);
  });
});
