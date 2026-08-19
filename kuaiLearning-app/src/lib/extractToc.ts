// Extract a table of contents (h1–h3) from lesson HTML. The ids are
// deterministic: the i-th non-empty heading in document order gets
// `kuai-toc-{i}`. LessonRenderer tags the iframe's headings with the same
// scheme, so the two sides always match without passing data around.

export interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

export const TOC_HEADING_SELECTOR = 'h1, h2, h3';
export const TOC_ID_PREFIX = 'kuai-toc-';

export function tocHeadingId(index: number): string {
  return `${TOC_ID_PREFIX}${index}`;
}

export function extractToc(html: string): TocItem[] {
  if (!html || typeof DOMParser === 'undefined') return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const items: TocItem[] = [];
    let n = 0;
    for (const h of Array.from(doc.querySelectorAll(TOC_HEADING_SELECTOR))) {
      const text = (h.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      items.push({ id: tocHeadingId(n), text, level: Number(h.tagName[1]) as 1 | 2 | 3 });
      n++;
    }
    return items;
  } catch {
    return [];
  }
}
