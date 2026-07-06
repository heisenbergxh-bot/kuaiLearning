import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
