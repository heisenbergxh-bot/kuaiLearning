import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTranslation } from '../i18n/useTranslation';
import { MissionChat } from './MissionChat';
import { AppIcon, type AppIconName } from './AppIcon';
import type { Workspace } from '../types';
import { useAuth } from '../auth/authContext';

interface NavigationSidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { workspaces, activeId, syncError, setActive, deleteWorkspace, loadWorkspaces } = useWorkspaceStore();
  const { t } = useTranslation();
  const [chatOpen, setChatOpen] = useState(false);

  const handleDelete = async (workspace: Workspace) => {
    if (!confirm(t('deleteWorkspaceConfirm', { name: workspace.name }))) return;
    try { await deleteWorkspace(workspace.id); }
    catch (reason) { alert(reason instanceof Error ? reason.message : t('workspaceDeleteFailed')); }
  };

  return (
    <div className="border-b border-[var(--color-border)] px-3 py-3">
      <div className={`mb-2 flex items-center ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
        <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] ${collapsed ? 'lg:hidden' : ''}`}>{t('workspaces')}</span>
        <button type="button" onClick={() => setChatOpen(true)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2.5 text-xs font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-accent-border)] hover:bg-[var(--color-accent-light)] hover:text-[var(--color-accent)]" title={t('newWorkspace')}>
          <AppIcon name="plus" className="h-3.5 w-3.5" />
          <span className={collapsed ? 'lg:hidden' : ''}>{t('newWorkspace').replace('+ ', '')}</span>
        </button>
      </div>
      <div className={`space-y-1 ${collapsed ? 'lg:hidden' : ''}`}>
        {workspaces.map(workspace => (
          <div key={workspace.id} className="group flex items-center gap-1">
            <button type="button" onClick={() => setActive(workspace.id)} className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${workspace.id === activeId ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]'}`}>{workspace.name}</button>
            <button type="button" onClick={() => handleDelete(workspace)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-0 transition-all hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] focus:opacity-100 group-hover:opacity-100" title={t('delete')} aria-label={`${t('delete')} ${workspace.name}`}>
              <AppIcon name="trash" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        {workspaces.length === 0 && <p className="px-2.5 py-1 text-xs leading-5 text-[var(--color-text-muted)]">{t('noWorkspaceHint')}</p>}
      </div>
      {syncError && !collapsed && (
        <button type="button" className="mt-2 flex w-full items-start gap-2 rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-bg)] px-2.5 py-2 text-left text-[11px] text-[var(--color-warning)]" title={syncError} onClick={() => void loadWorkspaces()}>
          <AppIcon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t('workspaceSyncFailed').replace('⚠ ', '')}
        </button>
      )}
      <MissionChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

const LIBRARY_PATHS = ['/references', '/glossary', '/records', '/resources'];
const LIBRARY_OPEN_KEY = 'kuai-sidebar-library';

export function NavigationSidebar({ collapsed, mobileOpen, onCloseMobile }: NavigationSidebarProps) {
  const activeId = useWorkspaceStore(state => state.activeId);
  const { t, lang } = useTranslation();
  const location = useLocation();
  const { user, logout } = useAuth();
  const workspacePath = `/workspace/${activeId || 'new'}`;
  const primaryLinks: Array<{ to: string; label: string; icon: AppIconName }> = [
    { to: `${workspacePath}/mission`, label: t('mission'), icon: 'target' },
    { to: `${workspacePath}/lessons`, label: t('lessons'), icon: 'book' },
    { to: `${workspacePath}/quiz`, label: t('quizBank'), icon: 'brain' },
  ];
  const libraryLinks: Array<{ to: string; label: string; icon: AppIconName }> = [
    { to: `${workspacePath}/references`, label: lang === 'zh' ? '速查资料' : 'References', icon: 'file' },
    { to: `${workspacePath}/glossary`, label: t('glossary'), icon: 'glossary' },
    { to: `${workspacePath}/records`, label: t('records'), icon: 'notes' },
    { to: `${workspacePath}/resources`, label: t('resources'), icon: 'resources' },
  ];
  const inLibrary = LIBRARY_PATHS.some(path => location.pathname.includes(path));
  const [libraryOpen, setLibraryOpen] = useState(() => {
    try { return localStorage.getItem(LIBRARY_OPEN_KEY) === '1'; } catch { return false; }
  });
  useEffect(() => { if (inLibrary) setLibraryOpen(true); }, [inLibrary]);

  const toggleLibrary = () => setLibraryOpen(current => {
    const next = !current;
    try { localStorage.setItem(LIBRARY_OPEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex h-10 items-center rounded-lg text-sm transition-colors ${collapsed ? 'lg:justify-center lg:px-0' : 'gap-3 px-3'} ${isActive ? 'bg-[var(--color-accent-light)] font-medium text-[var(--color-accent)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text-heading)]'}`;
  const userName = user.display_name || user.preferred_username || (lang === 'zh' ? '当前用户' : 'Current user');

  return (
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-card)] shadow-2xl transition-[width,transform] duration-200 lg:relative lg:z-0 lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} ${collapsed ? 'lg:w-20' : 'lg:w-64'}`}>
      <div className={`flex h-16 shrink-0 items-center border-b border-[var(--color-border)] px-4 ${collapsed ? 'lg:justify-center' : 'justify-between'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)] text-white shadow-sm shadow-[var(--color-accent)]/20"><AppIcon name="sparkles" className="h-5 w-5" /></div>
          <div className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <h1 className="truncate text-sm font-bold tracking-tight text-[var(--color-text-heading)]">KuaiLearning</h1>
            <p className="truncate text-[10px] text-[var(--color-text-muted)]">{lang === 'zh' ? 'AI 学习工作台' : 'AI learning workspace'}</p>
          </div>
        </div>
        <button type="button" onClick={onCloseMobile} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] lg:hidden" aria-label={lang === 'zh' ? '关闭导航' : 'Close navigation'}><AppIcon name="close" className="h-5 w-5" /></button>
      </div>

      <WorkspaceSwitcher collapsed={collapsed} />
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {primaryLinks.map(link => <NavLink key={link.to} to={link.to} className={linkClass} title={collapsed ? link.label : undefined}><AppIcon name={link.icon} className="h-[18px] w-[18px] shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{link.label}</span></NavLink>)}
        <div className="pt-3">
          <button type="button" onClick={toggleLibrary} className={`flex h-9 w-full items-center rounded-lg text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] ${collapsed ? 'lg:justify-center lg:px-0' : 'justify-between px-3'}`} aria-expanded={libraryOpen} title={collapsed ? t('library') : undefined}>
            <span className={collapsed ? 'lg:hidden' : ''}>{t('library')}</span><AppIcon name="chevron" className={`h-3.5 w-3.5 transition-transform ${libraryOpen ? 'rotate-90' : ''}`} />
          </button>
          {(libraryOpen || collapsed) && <div className="mt-1 space-y-1">{libraryLinks.map(link => <NavLink key={link.to} to={link.to} className={linkClass} title={collapsed ? link.label : undefined}><AppIcon name={link.icon} className="h-[18px] w-[18px] shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{link.label}</span></NavLink>)}</div>}
        </div>
      </nav>

      <div className="border-t border-[var(--color-border)] p-3">
        <NavLink to="/settings" className={linkClass} title={collapsed ? t('settings') : undefined}><AppIcon name="settings" className="h-[18px] w-[18px] shrink-0" /><span className={collapsed ? 'lg:hidden' : ''}>{t('settings')}</span></NavLink>
        <div className={`mt-2 flex items-center rounded-xl bg-[var(--color-bg-subtle)] p-2 ${collapsed ? 'lg:justify-center' : 'gap-2.5'}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-light)] text-xs font-semibold text-[var(--color-accent)]">{userName.slice(0, 1).toUpperCase()}</div>
          <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}><p className="truncate text-xs font-medium text-[var(--color-text-heading)]">{userName}</p><p className="truncate text-[10px] text-[var(--color-text-muted)]">{user.email || user.preferred_username || ''}</p></div>
          {user.auth_source === 'casdoor' && <button type="button" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger)] ${collapsed ? 'lg:hidden' : ''}`} onClick={() => void logout().catch(error => alert(error instanceof Error ? error.message : '退出失败'))} title={lang === 'zh' ? '退出登录' : 'Sign out'} aria-label={lang === 'zh' ? '退出登录' : 'Sign out'}><AppIcon name="logout" className="h-4 w-4" /></button>}
        </div>
      </div>
    </aside>
  );
}
