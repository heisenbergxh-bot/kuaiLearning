import { useSettingsStore } from '../stores/useSettingsStore';
import type { ThemePreference } from '../types';
import { AppIcon, type AppIconName } from './AppIcon';

interface ThemeControlProps {
  compact?: boolean;
  labels: Record<ThemePreference, string>;
}

const options: Array<{ value: ThemePreference; icon: AppIconName }> = [
  { value: 'system', icon: 'monitor' },
  { value: 'light', icon: 'sun' },
  { value: 'dark', icon: 'moon' },
];

export function ThemeControl({ compact = false, labels }: ThemeControlProps) {
  const { settings, setTheme } = useSettingsStore();

  if (compact) {
    const currentIndex = options.findIndex(option => option.value === settings.theme);
    const current = options[currentIndex] || options[0];
    const next = options[(currentIndex + 1) % options.length];
    return (
      <button
        type="button"
        onClick={() => setTheme(next.value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]"
        title={`${labels[current.value]} · ${labels[next.value]}`}
        aria-label={`${labels[current.value]} · ${labels[next.value]}`}
      >
        <AppIcon name={current.icon} />
      </button>
    );
  }

  return (
    <div className="inline-flex rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-1">
      {options.map(option => {
        const active = settings.theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${active ? 'bg-[var(--color-bg-card)] text-[var(--color-text-heading)] shadow-sm' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
            aria-pressed={active}
          >
            <AppIcon name={option.icon} />
            {labels[option.value]}
          </button>
        );
      })}
    </div>
  );
}
