import { getSupabase, needsClientOnLoad } from './supabase';
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

/** Resolves the lazily-loaded client, or explains why there isn't one. */
async function client() {
  const c = getSupabase();
  if (!c) throw new Error('Sync is not configured for this deployment.');
  return c;
}

export const supabaseAuth: AuthAdapter = {
  async requestSignInLink(email: string) {
    // Kept from the stub: the local check gives an instant, specific error instead of a round trip
    // that comes back with a generic one.
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');

    const supabase = await client();
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
    const supabase = await client();
    // `getUser` rather than `getSession`: getSession reports what is in local storage, which is
    // whatever was last written there. getUser validates the token against the auth server, so a
    // tampered or expired session fails here rather than later, against the database.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw new Error(error.message);
    const session = toSession(data.user);
    if (!session) throw new Error('That sign-in link is no longer valid. Request a new one.');
    return session;
  },

  async verifyCode(email: string, code: string): Promise<AuthSession> {
    const supabase = await client();
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      // 'email' covers both the sign-up confirmation and a returning sign-in, which is what this
      // needs: the app makes no distinction between the two and neither should this.
      type: 'email',
    });
    if (error) {
      // Worth rewriting. Supabase says "Token has expired or is invalid", which reads as a bug in
      // the app rather than a code that has aged out or been mistyped.
      throw new Error('That code didn\u2019t work. It may have expired \u2014 request a new one.');
    }
    const session = toSession(data.user);
    if (!session) throw new Error('That code didn\u2019t work. Request a new one.');
    return session;
  },

  async signOut() {
    const c = getSupabase();
    if (!c) return;
    const supabase = await c;
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
let exchangeError: string | null = null;

/**
 * Why the last code exchange failed, in the library's own words, or null.
 *
 * This exists because the failure had no voice. With `detectSessionInUrl` on, the exchange happened
 * inside the client's `initialize()`, and its error never surfaced: `getSession()` simply answered
 * "no session", indistinguishable from never having signed in. Three separate wrong diagnoses came
 * out of that silence — a mail scanner, a second browser, an allow-list — each plausible, each
 * costing an attempt to disprove. The library knows exactly what went wrong; it was only ever a
 * question of asking it.
 */
export function lastExchangeError(): string | null {
  return exchangeError;
}

export async function sessionFromUrl(): Promise<AuthSession | null> {
  // The gate that keeps the deferral meaningful. Without it this runs on every cold load and pulls
  // the client down for everyone, including the majority who have never signed in — which is the
  // whole cost the dynamic import was there to avoid.
  if (!needsClientOnLoad()) return null;
  const c = getSupabase();
  if (!c) return null;
  const supabase = await c;

  /**
   * The exchange is done here rather than left to `detectSessionInUrl`, which is now off.
   *
   * Same work, one difference: the error is returned to us instead of disappearing. `sb_flow_id`
   * is read off `window.location` by the library, so this has to run before the URL is tidied —
   * hence the cleanup below rather than at the top.
   */
  const code = new URLSearchParams(window.location.search).get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    exchangeError = error ? `${error.name}: ${error.message}` : null;

    // Cleared either way. A code left in the address bar is spent, and a reload would only
    // reproduce the same failure with staler inputs.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('code');
      url.searchParams.delete('sb_flow_id');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch {
      /* An address bar we cannot tidy is not worth failing a sign-in over. */
    }

    if (data?.session) return toSession(data.session.user);
  }

  const { data } = await supabase.auth.getSession();
  return toSession(data.session?.user);
}

/**
 * Watches for the session changing underneath the app: a token refresh, a sign-out performed in
 * another tab, or the PKCE exchange finishing after load. Returns an unsubscribe.
 */
export function onSessionChange(fn: (session: AuthSession | null) => void): () => void {
  // Same gate. With no session to follow there is nothing for this to report, and subscribing
  // would load the client purely to watch it stay signed out. Someone signing in during this
  // session returns via a magic link, which is a fresh page load — and by then the gate is open.
  if (!needsClientOnLoad()) return () => {};
  const c = getSupabase();
  if (!c) return () => {};
  // The client may still be loading, so unsubscribing has to survive being called before the
  // subscription exists — hence the flag rather than just returning the real unsubscribe.
  let cancelled = false;
  let stop: (() => void) | null = null;
  c.then((supabase) => {
    if (cancelled) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(toSession(session?.user)));
    stop = () => data.subscription.unsubscribe();
  });
  return () => { cancelled = true; stop?.(); };
}
