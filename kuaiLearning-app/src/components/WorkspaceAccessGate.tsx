import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useWorkspaceStore } from '../stores/useWorkspaceStore';

export function WorkspaceAccessGate() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { workspaces, activeId, initialized } = useWorkspaceStore();

  if (!initialized) {
    return <div className="py-16 text-center text-sm text-[var(--color-text-muted)]">正在加载当前账号的工作区…</div>;
  }

  if (workspaceId && workspaces.some(workspace => workspace.id === workspaceId)) {
    return <Outlet />;
  }

  const target = activeId || workspaces[0]?.id;
  return <Navigate to={target ? `/workspace/${target}/mission` : '/'} replace />;
}
