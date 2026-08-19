import type { TocItem } from '../lib/extractToc';

interface LessonTocProps {
  items: TocItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

// Renders the heading list shared by the desktop sticky rail and the mobile
// collapsible panel. Active item gets the accent bar + highlight.
export function LessonToc({ items, activeId, onSelect }: LessonTocProps) {
  return (
    <nav className="space-y-0.5">
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          title={item.text}
          onClick={() => onSelect(item.id)}
          className={`block w-full text-left text-[13px] leading-snug py-1.5 pl-3 pr-2 rounded-r-md border-l-2 truncate transition-colors ${
            item.level === 3 ? 'ml-4' : ''
          } ${
            item.level === 1 ? 'font-semibold' : ''
          } ${
            activeId === item.id
              ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-light)] font-medium'
              : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-accent-light)]/60'
          }`}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
