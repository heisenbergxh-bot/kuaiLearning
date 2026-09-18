import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthUser } from './authContext';
import { loginUrl, redirectToLogin } from './navigation';

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/v1/me', {
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (response.status === 401) {
          redirectToLogin();
          return;
        }
        if (!response.ok) {
          throw new Error(`身份服务暂不可用（${response.status}）`);
        }
        setUser((await response.json()) as AuthUser);
      })
      .catch(reason => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : '身份服务暂不可用');
      });
    return () => controller.abort();
  }, []);

  const value = useMemo<AuthContextValue | null>(() => {
    if (!user) return null;
    return {
      user,
      logout: async () => {
        const response = await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
        if (!response.ok) throw new Error('退出失败，请稍后重试');
        const ssoLogoutUrl = response.headers.get('X-Casdoor-Logout-Url');
        if (ssoLogoutUrl) {
          const ssoResponse = await fetch(ssoLogoutUrl, {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          });
          if (!ssoResponse.ok) {
            throw new Error('统一登录退出失败，请稍后重试');
          }
        }
        window.location.replace(loginUrl());
      },
    };
  }, [user]);

  if (error) {
    return (
      <main className="min-h-screen grid place-items-center bg-[var(--color-bg)] px-6">
        <section className="max-w-md rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] p-6 text-center">
          <h1 className="text-lg font-semibold text-[var(--color-text-heading)]">无法验证登录状态</h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{error}</p>
          <button className="mt-5 rounded bg-[var(--color-accent)] px-4 py-2 text-sm text-white" onClick={() => window.location.reload()}>
            重试
          </button>
        </section>
      </main>
    );
  }
  if (!value) {
    return <main className="min-h-screen grid place-items-center bg-[var(--color-bg)] text-sm text-[var(--color-text-muted)]">正在验证登录状态…</main>;
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
