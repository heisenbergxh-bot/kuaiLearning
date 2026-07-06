import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';
import { useTranslation } from '../i18n/useTranslation';
import { MissionChat } from './MissionChat';
import type { Workspace } from '../types';

function WorkspaceSwitcher() {
  const { workspaces, activeId, setActive, deleteWorkspace } = useWorkspaceStore();
  const { t } = useTranslation();
  const [chatOpen, setChatOpen] = useState(false);

  const handleNew = () => setChatOpen(true);

  const handleDelete = async (ws: Workspace) => {
    if (confirm(t('deleteWorkspaceConfirm', { name: ws.name }))) {
      await deleteWorkspace(ws.id);
    }
  };

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">{t('workspaces')}</span>
        <button
          onClick={handleNew}
          className="text-xs px-2 py-0.5 rounded border border-[var(--color-border)] hover:bg-[var(--color-accent-light)] hover:border-[var(--color-accent-border)] transition-colors"
          title={t('newWorkspace')}
        >
          {t('newWorkspace')}
        </button>
      </div>
      <div className="space-y-0.5">
        {workspaces.map(ws => (
          <div key={ws.id} className="group flex items-center">
            <button
              onClick={() => setActive(ws.id)}
              className={`flex-1 text-left text-sm px-2.5 py-1.5 rounded transition-colors truncate ${
                ws.id === activeId
                  ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                  : 'hover:bg-[var(--color-accent-light)]/50 text-[var(--color-text)]'
              }`}
            >
              {ws.name}
            </button>
            <button
              onClick={() => handleDelete(ws)}
              className="opacity-0 group-hover:opacity-100 px-1 text-xs text-red-400 hover:text-red-600 transition-opacity ml-0.5"
              title={t('delete')}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      {workspaces.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] px-2.5 py-1">
          {t('noWorkspaceHint')}
        </p>
      )}
      <MissionChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}

const LIBRARY_PATHS = ['/references', '/glossary', '/records', '/resources'];
const LIBRARY_OPEN_KEY = 'kuai-sidebar-library';

export function Sidebar() {
  const activeId = useWorkspaceStore(s => s.activeId);
  const { t } = useTranslation();
  const location = useLocation();
  const ws = `/workspace/${activeId || 'new'}`;

  const primaryLinks = [
    { to: `${ws}/mission`, label: t('mission'), icon: '🎯' },
    { to: `${ws}/lessons`, label: t('lessons'), icon: '📖' },
    { to: `${ws}/quiz`, label: t('quizBank'), icon: '🧠' },
  ];
  const libraryLinks = [
    { to: `${ws}/references`, label: t('references'), icon: '📄' },
    { to: `${ws}/glossary`, label: t('glossary'), icon: '📚' },
    { to: `${ws}/records`, label: t('records'), icon: '📝' },
    { to: `${ws}/resources`, label: t('resources'), icon: '🔗' },
  ];

  const inLibrary = LIBRARY_PATHS.some(p => location.pathname.includes(p));
  const [libOpen, setLibOpen] = useState(() => {
    try { return localStorage.getItem(LIBRARY_OPEN_KEY) === '1'; } catch { return false; }
  });
  // Always reveal the group when the current page lives inside it.
  useEffect(() => { if (inLibrary) setLibOpen(true); }, [inLibrary]);

  const toggleLib = () => {
    setLibOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(LIBRARY_OPEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
      isActive
        ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
        : 'text-[var(--color-text)] hover:bg-[var(--color-accent-light)]/50'
    }`;

  return (
    <aside className="w-56 min-w-[14rem] h-screen border-r border-[var(--color-border)] bg-[var(--color-bg-card)] flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--color-border)]">
        <h1 className="text-sm font-bold text-[var(--color-text-heading)] tracking-tight">
          {t('appTitle')}
        </h1>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
          {t('appSubtitle')}
        </p>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {primaryLinks.map(link => (
          <NavLink key={link.to} to={link.to} className={linkClass}>
            <span className="text-base">{link.icon}</span>
            {link.label}
          </NavLink>
        ))}

        {/* Collapsible "Library" group — auto-generated study material */}
        <button
          onClick={toggleLib}
          className="w-full flex items-center gap-2 px-3 py-2 mt-1 rounded text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] hover:bg-[var(--color-accent-light)]/40 transition-colors"
          aria-expanded={libOpen}
        >
          <span className={`text-[10px] transition-transform ${libOpen ? 'rotate-90' : ''}`}>▸</span>
          {t('library')}
        </button>
        {libOpen && (
          <div className="space-y-0.5">
            {libraryLinks.map(link => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                <span className="text-base pl-2">{link.icon}</span>
                {link.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="px-3 py-2 border-t border-[var(--color-border)]">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
              isActive
                ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:bg-[var(--color-accent-light)]/50'
            }`
          }
        >
          <span className="text-base">⚙️</span>
          {t('settings')}
        </NavLink>
      </div>
    </aside>
  );
}
