import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { stubAuth, type AuthAdapter, type AuthSession } from '../lib/auth';

/**
 * Session state.
 *
 * Nothing is persisted here on purpose, in either mode. With the stub that was the point — a
 * refresh signs you out, so a preview can never be mistaken for a working account. With a real
 * backend it is still right, just for a different reason: the session already lives in the auth
 * client's own storage, refreshed and revoked by it, and a second copy of it here could only ever
 * disagree. `bootstrap` and `subscribe` below read that one source instead of duplicating it.
 */
interface AuthValue {
  session: AuthSession | null;
  pending: boolean;
  error: string;
  /** Email the link was "sent" to, driving the check-your-inbox step. */
  awaitingEmail: string | null;
  /**
   * Whether the initial "is there a session?" question has been answered.
   *
   * Absent this, `session === null` means both "still looking" and "there is none", and anything
   * reacting to a failed sign-in would fire during startup on every ordinary visit.
   */
  ready: boolean;
  requestLink: (email: string) => Promise<void>;
  confirmSignIn: () => Promise<void>;
  /** Finish sign-in with the code from the email. */
  verifyCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  reset: () => void;
  /**
   * True when sign-in is faked and no mail is sent, so the screens can say so. Derived from
   * whether a bootstrap was supplied rather than from an env flag, because the thing that makes
   * sign-in real is having a backend to come back from — not a variable claiming there is one.
   */
  simulated: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  adapter = stubAuth,
  bootstrap,
  subscribe,
}: {
  children: React.ReactNode;
  adapter?: AuthAdapter;
  /** Reads any session that already exists — one restored from storage, or one a magic link just
   *  created. Absent for the stub, which has nothing to restore. */
  bootstrap?: () => Promise<AuthSession | null>;
  /** Notifies of sessions appearing or disappearing outside this component: a token refresh, a
   *  sign-out in another tab, or the link exchange finishing after first paint. */
  subscribe?: (fn: (session: AuthSession | null) => void) => () => void;
}) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

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

  const verifyCode = useCallback(async (code: string) => {
    if (!awaitingEmail) return;
    setPending(true);
    setError('');
    try {
      setSession(await adapter.verifyCode(awaitingEmail, code));
      setAwaitingEmail(null);
    } catch (e) {
      // Left on this screen deliberately: a mistyped code should cost one more attempt, not the
      // whole flow and another email.
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

  /**
   * Adopt whatever session already exists, and keep following it.
   *
   * This is what replaces the stub's "simulate clicking the link" button. A real magic link lands
   * back on the app as a fresh page load, so by the time any of this runs the exchange has either
   * happened or is about to — there is no button to press. Clearing `awaitingEmail` on arrival is
   * what moves the sheet off "check your inbox" for someone who left it open in this tab.
   */
  useEffect(() => {
    if (!bootstrap) { setReady(true); return; }
    let alive = true;
    bootstrap()
      .then((s) => { if (alive && s) { setSession(s); setAwaitingEmail(null); } })
      .catch(() => { /* No session is the ordinary case, not an error worth showing. */ })
      // Settled, not successful. The caller needs to know the question has been answered so it can
      // tell "no session yet" apart from "no session, and none is coming" — which is the difference
      // between an app still starting up and a sign-in that failed.
      .finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [bootstrap]);

  useEffect(() => {
    if (!subscribe) return;
    return subscribe((s) => {
      setSession(s);
      if (s) setAwaitingEmail(null);
    });
  }, [subscribe]);

  const reset = useCallback(() => { setAwaitingEmail(null); setError(''); }, []);

  const value = useMemo(
    () => ({ session, pending, error, awaitingEmail, ready, requestLink, confirmSignIn, verifyCode, signOut, reset, simulated: !bootstrap }),
    [session, pending, error, awaitingEmail, ready, requestLink, confirmSignIn, verifyCode, signOut, reset, bootstrap],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
