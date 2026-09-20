import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { NavigationSidebar } from './NavigationSidebar';
import { AppIcon } from './AppIcon';
import { ThemeControl } from './ThemeControl';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTranslation } from '../i18n/useTranslation';

const SIDEBAR_COLLAPSED_KEY = 'kuai-sidebar-collapsed';

export function AppShell() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { workspaces, activeId } = useWorkspaceStore();
  const { t, lang } = useTranslation();
  const workspace = workspaces.find(item => item.id === activeId);

  useEffect(() => setMobileOpen(false), [location.pathname]);

  const toggleSidebar = () => setCollapsed(current => {
    const next = !current;
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const pageTitle = getPageTitle(location.pathname, t, lang);
  const themeLabels = {
    system: lang === 'zh' ? '跟随系统' : 'System',
    light: lang === 'zh' ? '浅色模式' : 'Light mode',
    dark: lang === 'zh' ? '深色模式' : 'Dark mode',
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)]">
      <NavigationSidebar collapsed={collapsed} mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
      {mobileOpen && <button type="button" aria-label={lang === 'zh' ? '关闭导航' : 'Close navigation'} onClick={() => setMobileOpen(false)} className="fixed inset-0 z-30 bg-[var(--color-overlay)] backdrop-blur-[2px] lg:hidden" />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-heading)] lg:hidden" aria-label={lang === 'zh' ? '打开导航' : 'Open navigation'}>
              <AppIcon name="menu" className="h-5 w-5" />
            </button>
            <button type="button" onClick={toggleSidebar} className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-heading)] lg:inline-flex" aria-label={collapsed ? (lang === 'zh' ? '展开侧栏' : 'Expand sidebar') : (lang === 'zh' ? '收起侧栏' : 'Collapse sidebar')}>
              <AppIcon name="panel" className={`h-5 w-5 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                <span className="max-w-44 truncate">{workspace?.name || (lang === 'zh' ? '快学工作台' : 'KuaiLearning')}</span>
                <AppIcon name="chevron" className="h-3 w-3" />
                <span>{pageTitle}</span>
              </div>
              <h2 className="truncate text-base font-semibold text-[var(--color-text-heading)]">{pageTitle}</h2>
            </div>
          </div>
          <ThemeControl compact labels={themeLabels} />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}

function getPageTitle(pathname: string, t: (key: any) => string, lang: 'zh' | 'en') {
  if (pathname === '/settings') return t('settings');
  if (pathname.includes('/lesson/')) return lang === 'zh' ? '课程详情' : 'Lesson';
  if (pathname.endsWith('/mission')) return t('mission');
  if (pathname.endsWith('/lessons')) return t('lessons');
  if (pathname.endsWith('/quiz')) return t('quizBank');
  if (pathname.endsWith('/references')) return lang === 'zh' ? '速查资料' : 'References';
  if (pathname.endsWith('/glossary')) return t('glossary');
  if (pathname.endsWith('/records')) return t('records');
  if (pathname.endsWith('/resources')) return t('resources');
  return lang === 'zh' ? '学习工作台' : 'Learning workspace';
}
