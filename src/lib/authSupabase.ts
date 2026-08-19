import { supabase } from './supabase';
import { isValidEmail, type AuthAdapter, type AuthSession } from './auth';

/**
 * The real `AuthAdapter`, backed by Supabase magic links.
 *
 * Drops into the seam `src/lib/auth.ts` describes, which was written password-free on purpose:
 * "a password field backed by a stub would train people to hand a real, reused password to
 * something that cannot protect it". `signInWithOtp` keeps that shape — the user types an email,
 * receives a link, and no password exists to be reused or leaked.
 *
 * The stub's `completeSignIn` stood in for clicking the emailed link, driven by a button. Here
 * that step is not ours to drive: the link lands back on the app, and the client exchanges the
 * PKCE code for a session inside `initialize()` before any of our code runs. So `completeSignIn`
 * reads the session that already exists rather than creating one, and `sessionFromUrl` below is
 * what the app calls on load to notice it.
 */

function toSession(user: { id: string; email?: string | null } | null | undefined): AuthSession | null {
  if (!user) return null;
  return { email: user.email ?? '', userId: user.id };
}

/** Where the magic link comes back to. Must be allow-listed in Supabase's URL Configuration. */
function redirectTo(): string {
  // The app is a single page with no routes — history layers, not URLs — so the link returns to
  // wherever it was opened from. `origin + pathname` deliberately drops any existing query or
  // hash so the returning URL is clean before the client appends its code.
  return `${window.location.origin}${window.location.pathname}`;
}

export const supabaseAuth: AuthAdapter = {
  async requestSignInLink(email: string) {
    if (!supabase) throw new Error('Sync is not configured for this deployment.');
    // Kept from the stub: the local check gives an instant, specific error instead of a round trip
    // that comes back with a generic one.
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo(),
        /**
         * New addresses become accounts. There is no separate sign-up screen in this app and no
         * reason for one — an account exists only to hold your own records, so "sign in" and
         * "create an account" are the same act from the user's side.
         */
        shouldCreateUser: true,
      },
    });

    /**
     * Supabase answers the same way whether or not the address has an account, and this must not
     * undo that. Reporting "no account for that email" would turn the sign-in box into a way to
     * test whether any given person uses the app.
     */
    if (error) throw new Error(error.message);
  },

  async completeSignIn(): Promise<AuthSession> {
    if (!supabase) throw new Error('Sync is not configured for this deployment.');
    // `getUser` rather than `getSession`: getSession reports what is in local storage, which is
    // whatever was last written there. getUser validates the token against the auth server, so a
    // tampered or expired session fails here rather than later, against the database.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const session = toSession(data.user);
    if (!session) throw new Error('That sign-in link is no longer valid. Request a new one.');
    return session;
  },

  async signOut() {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  },
};

/**
 * The session established by a magic link that has just been followed, if there is one.
 *
 * Called on load. Returns null for the ordinary case — someone opening the app normally, signed in
 * or not — so the caller can treat it as "did we just arrive from an email link".
 */
export async function sessionFromUrl(): Promise<AuthSession | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return toSession(data.session?.user);
}

/**
 * Watches for the session changing underneath the app: a token refresh, a sign-out performed in
 * another tab, or the PKCE exchange finishing after load. Returns an unsubscribe.
 */
export function onSessionChange(fn: (session: AuthSession | null) => void): () => void {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    fn(toSession(session?.user));
  });
  return () => data.subscription.unsubscribe();
}
