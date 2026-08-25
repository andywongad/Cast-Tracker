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
        /**
         * Off, and the exchange is run by hand in `sessionFromUrl`.
         *
         * Automatic detection did the same work but kept its error to itself — a failed exchange
         * was indistinguishable from never having signed in, which is what made this bug take a
         * day to corner. Doing it explicitly costs a few lines and returns the reason.
         */
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        /**
         * Without this, every sign-in on this project failed silently.
         *
         * auth-js 2.112.3 stores each flow's PKCE verifier in its own slot and also dual-writes a
         * legacy fixed key which, in its own words, "mirrors the most recently started flow". The
         * callback only carries the flow id when this flag is on, so by default the exchange falls
         * back to that fixed key — and the moment a second link is requested before the first is
         * clicked, the key holds the newer flow's verifier. The older code then fails against it,
         * the token endpoint rejects the exchange, and nothing reaches the URL to say so: the app
         * opens looking ordinary and signed out. Retrying makes it *more* likely, not less.
         *
         * Turning it on puts `sb_flow_id` on the return URL so the exact slot is used. That means
         * the redirect now carries a query string, which the allow-list in supabase/config.toml
         * has to admit — hence the `/**` entries there.
         */
        experimental: { appendPkceFlowIdToRedirects: true },
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
 * Three cases are detectable without the library — a `code` in the query string, an `access_token`
 * in the fragment, or a token already in storage under GoTrue's key — so the deferral holds for
 * everyone else.
 *
 * The fragment case is not hypothetical and not only about admin-minted links. Any return that
 * carries tokens directly rather than a PKCE code lands there, and it was silently dropped: the
 * client never loaded, so nothing read the fragment, and the app opened signed out with the
 * session sitting unused in the address bar. It is also the one return that works across browsers,
 * because tokens in the URL need no verifier stored anywhere.
 */
export function needsClientOnLoad(): boolean {
  if (!isSyncConfigured()) return false;
  try {
    if (new URLSearchParams(window.location.search).has('code')) return true;
    if (new URLSearchParams(window.location.hash.replace(/^#/, '')).has('access_token')) return true;
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
