import { useTranslation } from '../i18n/useTranslation';
import type { Lesson } from '../types';

export const libraryInputClass = 'w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm text-[var(--color-text)]';

interface Props {
  query: string;
  onQuery: (query: string) => void;
  course: string;
  onCourse: (course: string) => void;
  lessons: Lesson[];
  sourceIds: (string | undefined)[];
  count: number;
  total: number;
  onReset: () => void;
}

export function LibraryTools({ query, onQuery, course, onCourse, lessons, sourceIds, count, total, onReset }: Props) {
  const { lang } = useTranslation();
  const zh = lang === 'zh';
  const ids = [...new Set(sourceIds.filter((id): id is string => !!id))];
  const options = ids.map(id => ({ id, lesson: lessons.find(lesson => lesson.id === id) }))
    .sort((a, b) => (a.lesson?.number ?? Infinity) - (b.lesson?.number ?? Infinity));
  return (
    <div className="mb-5 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input type="search" aria-label={zh ? '搜索内容' : 'Search content'} placeholder={zh ? '搜索标题、内容或关键词…' : 'Search titles, content or keywords…'} value={query} onChange={event => onQuery(event.target.value)} className={`${libraryInputClass} sm:flex-1`} />
        <select aria-label={zh ? '按来源课程筛选' : 'Filter by source lesson'} value={course} onChange={event => onCourse(event.target.value)} className={`${libraryInputClass} sm:w-56`}>
          <option value="all">{zh ? '全部课程与来源' : 'All lessons and sources'}</option>
          {sourceIds.some(id => !id) && <option value="manual">{zh ? '手动添加 / 未关联课程' : 'Manual / no linked lesson'}</option>}
          {options.map(({ id, lesson }) => <option key={id} value={id}>{lesson ? `${lesson.number}. ${lesson.title}` : (zh ? '来源课程已移除' : 'Source lesson removed')}</option>)}
        </select>
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <span>{zh ? `显示 ${count} / ${total} 项` : `${count} of ${total} items`}</span>
        {(query || course !== 'all' || count !== total) && <button type="button" onClick={onReset} className="text-[var(--color-accent)] hover:underline">{zh ? '清除筛选' : 'Clear filters'}</button>}
      </div>
    </div>
  );
}

export function LibraryNoResults({ onReset }: { onReset: () => void }) {
  const { lang } = useTranslation();
  return <div className="rounded-xl border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-muted)]">
    <p>{lang === 'zh' ? '没有找到匹配内容，试试其他关键词或来源课程。' : 'No matches. Try another keyword or source lesson.'}</p>
    <button type="button" onClick={onReset} className="mt-3 text-[var(--color-accent)] hover:underline">{lang === 'zh' ? '清除筛选' : 'Clear filters'}</button>
  </div>;
}
