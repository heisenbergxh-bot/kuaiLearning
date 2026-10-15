export function matchesLibrarySearch(query: string, ...values: (string | undefined)[]): boolean {
  const text = values.filter(Boolean).join(' ').toLocaleLowerCase();
  return query.trim().toLocaleLowerCase().split(/\s+/).every(word => text.includes(word));
}

export function matchesLibraryCourse(filter: string, sourceId?: string): boolean {
  return filter === 'all' || (filter === 'manual' ? !sourceId : sourceId === filter);
}

export function referenceText(html: string): string {
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style').forEach(element => element.remove());
  document.querySelectorAll('h1,h2,h3,h4,p,li,td,th,pre,br').forEach(element => element.append(' '));
  return (document.body.textContent || '').replace(/\s+/g, ' ').trim();
}

export function localDayKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
