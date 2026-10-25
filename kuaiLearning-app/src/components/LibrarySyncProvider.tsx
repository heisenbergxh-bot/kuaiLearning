import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { LibrarySyncContext, useLibrarySync } from '../lib/librarySyncContext';
import type { SyncState } from '../lib/librarySyncContext';
import type { LibraryKind } from '../api/library';
import { removeLibraryItem, synchronizeWorkspaceLibrary } from '../api/librarySync';
import { useTranslation } from '../i18n/useTranslation';

export function LibrarySyncProvider({ workspaceId, children }: { workspaceId: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const [status, setStatus] = useState<SyncState['status']>('syncing');
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const operation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refresh = useCallback(async () => {
    const ticket = ++operation.current;
    setStatus('syncing');
    try {
      await synchronizeWorkspaceLibrary(workspaceId);
      if (mounted.current) { setRevision(value => value + 1); if (ticket === operation.current) setStatus('synced'); }
      return true;
    } catch {
      if (mounted.current) { setRevision(value => value + 1); if (ticket === operation.current) setStatus('error'); }
      return false;
    }
  }, [workspaceId]);
  const remove = useCallback(async (kind: LibraryKind, id: string) => {
    const ticket = ++operation.current;
    setStatus('syncing');
    try {
      await removeLibraryItem(workspaceId, kind, id);
      await synchronizeWorkspaceLibrary(workspaceId);
      if (mounted.current) { setRevision(value => value + 1); if (ticket === operation.current) setStatus('synced'); }
      return true;
    } catch {
      if (mounted.current && ticket === operation.current) setStatus('error');
      return false;
    }
  }, [workspaceId]);
  useEffect(() => { void refresh(); }, [refresh, pathname]);
  useEffect(() => {
    const retry = () => { void refresh(); };
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => { window.removeEventListener('online', retry); window.removeEventListener('focus', retry); };
  }, [refresh]);
  const value = useMemo(() => ({ status, revision, refresh, remove }), [status, revision, refresh, remove]);
  return <LibrarySyncContext.Provider value={value}>{children}</LibrarySyncContext.Provider>;
}

export function LibrarySyncNotice() {
  const { status, refresh } = useLibrarySync();
  const { lang } = useTranslation();
  if (status === 'local') return null;
  const zh = lang === 'zh';
  return <div role={status === 'error' ? 'alert' : 'status'} className={`mb-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${status === 'error' ? 'border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] text-[var(--color-warning)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'}`}>
    <span>{status === 'syncing' ? (zh ? '正在同步课程、速查资料、术语和学习记录…' : 'Syncing lessons, references, glossary and learning records…')
      : status === 'synced' ? (zh ? '已与服务器同步，可在其他电脑登录查看。' : 'Synced with the server. Sign in on another device to view these items.')
      : (zh ? '同步未完成，部分内容可能仅保存在本机；无法确认删除时会保留本机记录。请重试后再更换电脑。' : 'Sync incomplete. Some items may only be saved here; unconfirmed deletions retain their local copy. Retry before switching devices.')}</span>
    {status === 'error' && <button type="button" onClick={() => void refresh()} className="font-medium underline">{zh ? '重新同步' : 'Retry sync'}</button>}
  </div>;
}
