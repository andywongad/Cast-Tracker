import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { stubAuth, type AuthAdapter, type AuthSession } from '../lib/auth';

/**
 * Session state for the sign-up preview. Held in React state only — never written to
 * localStorage — so a refresh signs you out. That's intentional: persisting it would make the
 * preview feel like a real account, which is exactly what this must not do.
 */
interface AuthValue {
  session: AuthSession | null;
  pending: boolean;
  error: string;
  /** Email the link was "sent" to, driving the check-your-inbox step. */
  awaitingEmail: string | null;
  requestLink: (email: string) => Promise<void>;
  confirmSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children, adapter = stubAuth }: { children: React.ReactNode; adapter?: AuthAdapter }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);

  const requestLink = useCallback(async (email: string) => {
    setPending(true);
    setError('');
    try {
      await adapter.requestSignInLink(email);
      setAwaitingEmail(email.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }, [adapter]);

  // Stands in for clicking the emailed link. A real adapter would be driven by a URL token
  // on load instead of a button press.
  const confirmSignIn = useCallback(async () => {
    if (!awaitingEmail) return;
    setPending(true);
    try {
      setSession(await adapter.completeSignIn(awaitingEmail));
      setAwaitingEmail(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setPending(false);
    }
  }, [adapter, awaitingEmail]);

  const signOut = useCallback(async () => {
    setPending(true);
    try {
      await adapter.signOut();
      setSession(null);
    } finally {
      setPending(false);
    }
  }, [adapter]);

  const reset = useCallback(() => { setAwaitingEmail(null); setError(''); }, []);

  const value = useMemo(
    () => ({ session, pending, error, awaitingEmail, requestLink, confirmSignIn, signOut, reset }),
    [session, pending, error, awaitingEmail, requestLink, confirmSignIn, signOut, reset],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
