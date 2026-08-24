/**
 * Auth seam. Nothing here talks to a server — this exists so the sign-up screens have a real
 * interface to sit on, and so swapping in Supabase/Clerk/Firebase later is a one-file change
 * rather than a rewrite of every component that touches auth.
 *
 * DELIBERATE OMISSION: there is no password anywhere in this interface. The screens use a
 * magic-link shape (enter email -> "check your inbox"), because a password field backed by a
 * stub would train people to hand a real, reused password to something that cannot protect it.
 * Whatever backend lands here should keep that shape.
 *
 * Preview only — gated by VITE_ENABLE_AUTH_PREVIEW, off unless explicitly set. See isAuthPreviewEnabled().
 */

export interface AuthSession {
  email: string;
  /** When a real backend lands this carries its user id; the stub has no id to give. */
  userId: string | null;
}

export interface AuthAdapter {
  /** Real impl: send a magic link and a typed code. Stub: resolves without sending anything. */
  requestSignInLink(email: string): Promise<void>;
  /** Real impl: exchange a link token for a session. Stub: fabricates a local one. */
  completeSignIn(email: string): Promise<AuthSession>;
  /**
   * Exchange a code typed by the user for a session.
   *
   * Exists because the link on its own is not reliable enough on a phone. PKCE keeps its one-time
   * verifier in the storage of the browser that asked for the link, and tapping a link in a mail
   * app routinely opens an in-app webview or hands off to a different browser — which has no
   * verifier, so the exchange fails and the app simply looks signed out. Measured that failure on
   * this project: the address was confirmed, and `last_sign_in_at` stayed null with zero sessions.
   *
   * A typed code cannot go astray that way. It is entered in the browser that requested it, so no
   * handoff exists to break, and unlike the implicit flow it puts no token in a URL.
   */
  verifyCode(email: string, code: string): Promise<AuthSession>;
  signOut(): Promise<void>;
}

export class NotImplementedAuthError extends Error {
  constructor(method: string) {
    super(`${method} has no backend yet — see src/lib/auth.ts`);
    this.name = 'NotImplementedAuthError';
  }
}

/**
 * Stub adapter. Fakes latency so the screens exercise their loading states, and returns a session
 * that lives in memory only — it is intentionally NOT persisted, so a reload drops you back to
 * signed-out. That keeps the preview from ever looking like a working account.
 */
export const stubAuth: AuthAdapter = {
  async requestSignInLink(email: string) {
    if (!isValidEmail(email)) throw new Error('Enter a valid email address.');
    await delay(700);
    // A real adapter sends mail here. The stub deliberately does nothing.
  },
  async completeSignIn(email: string) {
    await delay(400);
    return { email, userId: null };
  },
  async verifyCode(email: string) {
    await delay(400);
    // The stub has no code to check — any six digits pass, which is the point of a preview.
    return { email, userId: null };
  },
  async signOut() {
    await delay(150);
  },
};

export function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

/** Off unless explicitly switched on, so an unfinished flow can't ship looking functional. */
export function isAuthPreviewEnabled(): boolean {
  return String(import.meta.env.VITE_ENABLE_AUTH_PREVIEW ?? '').trim() === 'true';
}

/**
 * The failure a sign-in link reports when it comes back, in words worth reading.
 *
 * A link that cannot be used redirects to the app carrying `error`, `error_code` and
 * `error_description` — in the query string, the fragment, or both. Nothing read them, so the app
 * opened looking ordinary and signed out, and the person who had just clicked a link had no way to
 * tell whether they had done something wrong, whether it had worked, or whether the app was broken.
 * Silence is the worst of the three.
 *
 * `otp_expired` is not usually about time. The token is single-use, and a mail scanner or link
 * previewer that fetches the message before the recipient spends it — verified on this project:
 * one GET consumed a fresh link and the next returned exactly this code. So the copy names the
 * likely cause rather than repeating "expired" at someone who clicked it ten seconds after it
 * arrived and knows perfectly well it isn't old.
 *
 * Consuming: the parameters are stripped from the URL as they are read, so a refresh doesn't
 * resurrect a message about something that already happened, and the address bar goes back to
 * being clean.
 */
export function consumeSignInLinkError(): string | null {
  if (typeof window === 'undefined') return null;
  let params: URLSearchParams;
  try {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    params = query.has('error') || query.has('error_code') ? query : fragment;
    if (!params.has('error') && !params.has('error_code')) return null;
  } catch {
    return null;
  }

  const code = params.get('error_code') || params.get('error') || '';
  const message =
    code === 'otp_expired'
      ? 'That sign-in link had already been used. Links only work once, and mail apps sometimes open them before you do — request a new one.'
      : code === 'access_denied'
        ? 'That sign-in link was rejected. Request a new one and open it in this browser.'
        : params.get('error_description')?.replace(/\+/g, ' ') || 'That sign-in link didn’t work. Request a new one.';

  try {
    const url = new URL(window.location.href);
    for (const k of ['error', 'error_code', 'error_description']) url.searchParams.delete(k);
    if (/error/.test(url.hash)) url.hash = '';
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
  } catch {
    // A URL we cannot rewrite is still a message worth showing.
  }

  return message;
}

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
