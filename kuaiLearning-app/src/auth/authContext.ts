import { createContext, useContext } from 'react';

export interface AuthUser {
  subject: string;
  employee_id: string | null;
  external_subject: string | null;
  preferred_username: string | null;
  display_name: string | null;
  email: string | null;
  auth_source: string;
}

export interface AuthContextValue {
  user: AuthUser;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthGate');
  return context;
}
