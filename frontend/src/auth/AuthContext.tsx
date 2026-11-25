import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { configureClient } from '../api/client';
import { authApi } from '../api/endpoints';
import type { User } from '../api/types';

/**
 * Sesión en sessionStorage (se borra al cerrar la pestaña). Es una decisión consciente con
 * implicaciones de seguridad frente a XSS, registrada como deuda técnica (TD-08): la alternativa
 * recomendada es una cookie HttpOnly emitida por el gateway.
 */
const STORAGE_KEY = 'greenalert.session';

interface Session {
  token: string;
  user: User;
  expiresAt: number;
}

interface AuthContextValue {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null): void {
  try {
    if (s) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* almacenamiento no disponible: la sesión vive solo en memoria */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const clear = useCallback(() => {
    writeSession(null);
    setSession(null);
  }, []);

  // Registro síncrono (idempotente): los efectos de los hijos se ejecutan antes que los del proveedor,
  // por lo que registrarlo en un useEffect dejaría las primeras solicitudes sin token.
  configureClient(() => sessionRef.current?.token ?? null, clear);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const next: Session = { token: res.accessToken, user: res.user, expiresAt: Date.now() + res.expiresIn * 1000 };
    sessionRef.current = next;
    writeSession(next);
    setSession(next);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      clear();
    }
  }, [clear]);

  const updateUser = useCallback((user: User) => {
    setSession((s) => {
      if (!s) return s;
      const next = { ...s, user };
      writeSession(next);
      return next;
    });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user: session?.user ?? null, ready: true, login, logout, updateUser }),
    [session, login, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
