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
  /** Real impl: send a magic link. Stub: resolves without sending anything. */
  requestSignInLink(email: string): Promise<void>;
  /** Real impl: exchange a link token for a session. Stub: fabricates a local one. */
  completeSignIn(email: string): Promise<AuthSession>;
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

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
