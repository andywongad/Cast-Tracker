// Type-only, so it is erased at build time and pulls nothing into the bundle.
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase browser client, loaded on demand.
 *
 * Imported dynamically rather than at the top of the module because sign-in is optional in this
 * app. Statically importing it cost 58KB gzipped on first load — a 61% increase on a 94.6KB
 * bundle — charged to every visitor including the majority who never sign in, on a phone, before
 * anything appears on screen. Now it is a separate chunk fetched the first time something actually
 * needs an account.
 *
 * ON THE KEY IN THE BUNDLE. Everything else here keeps its keys server-side, and the TMDb proxy
 * exists precisely because a VITE_-prefixed value is inlined into the JavaScript every visitor
 * downloads. This key is different in kind, not an exception: a publishable key is designed to be
 * public and grants nothing by itself. Row Level Security is what protects the data — it resolves
 * `auth.uid()` from the caller's JWT and cannot return another user's rows. The secret and
 * service-role keys bypass RLS entirely and must never acquire a VITE_ twin.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Whether this build can offer sign-in at all. Synchronous, and deliberately loads nothing — the
 * UI asks this to decide whether to render the entry point, which must not drag in the library.
 *
 * A build without these variables is a supported state, not an error: the app runs on localStorage
 * with no account, so a fork or a preview branch should work normally with sync simply absent.
 */
export function isSyncConfigured(): boolean {
  return !!(url && publishableKey);
}

let client: Promise<SupabaseClient> | null = null;

/** The client, loading it if needed. Null when this build has no Supabase configured. */
export function getSupabase(): Promise<SupabaseClient> | null {
  if (!isSyncConfigured()) return null;
  // Cached as the promise, not the resolved value, so two callers racing on load share one fetch
  // and one client — a second client would mean a second GoTrue instance racing on the same
  // storage key and token refresh.
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(url!, publishableKey!, {
      auth: {
        /**
         * PKCE rather than the library's `implicit` default. Implicit returns real access and
         * refresh tokens in the URL fragment; fragments are not sent to servers but they sit in
         * browser history and get copied when a link is shared. PKCE returns a single-use code
         * exchanged over HTTPS.
         *
         * Verified in @supabase/auth-js 2.112.3 that `initialize()` routes a PKCE callback through
         * `_isPKCECallback` → `_exchangeCodeForSession` automatically while `detectSessionInUrl`
         * is on, so this needs no redirect route of our own — which matters, because this SPA has
         * no router to hang one on.
         */
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    }),
  );
  return client;
}

/**
 * Whether the client has to load now rather than on demand.
 *
 * Deferring the import has one hazard: the PKCE exchange and the session restore both happen
 * inside the client's own `initialize()`, so a client that is never constructed never notices
 * either. Someone following a magic link would land on the app and stay signed out, and someone
 * already signed in would appear signed out until they happened to touch a sync feature.
 *
 * Both cases are detectable without the library — a `code` in the query string, or a token
 * already in storage under GoTrue's key — so the deferral holds for everyone else.
 */
export function needsClientOnLoad(): boolean {
  if (!isSyncConfigured()) return false;
  try {
    if (new URLSearchParams(window.location.search).has('code')) return true;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // GoTrue's default storage key is `sb-<project-ref>-auth-token`.
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) return true;
    }
  } catch {
    // Storage can throw in private modes; treat it as "nothing pending" rather than failing to load.
  }
  return false;
}
