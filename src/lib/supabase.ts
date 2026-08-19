import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The Supabase browser client, or null when this deployment has no Supabase configured.
 *
 * Null is a supported state, not an error. Sign-in is optional in this app: the whole thing works
 * against localStorage with no account, and sync is something you opt into. A build without these
 * variables — a fork, a local checkout, a preview branch — should run normally with the sync
 * features simply absent, not crash on load or show a broken sign-in screen.
 *
 * ON THE KEY IN THE BUNDLE. Everything else in this codebase keeps its keys server-side, and the
 * TMDb proxy exists precisely because a VITE_-prefixed key is inlined into the JavaScript every
 * visitor downloads. This key is different in kind, not an exception to that rule: a publishable
 * key is designed to be public and grants nothing on its own. What protects the data is Row Level
 * Security in Postgres, which resolves `auth.uid()` from the caller's JWT and can only ever return
 * that user's rows. The secret and service-role keys bypass RLS entirely and must never acquire a
 * VITE_ twin — there is no client code path that should ever hold one.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && publishableKey
    ? createClient(url, publishableKey, {
        auth: {
          /**
           * PKCE rather than the library's `implicit` default.
           *
           * Implicit flow returns real access and refresh tokens in the URL fragment when the magic
           * link lands. Fragments are not sent to servers, but they sit in browser history, get
           * copied when someone shares a URL, and are readable by anything running on the page.
           * PKCE returns a single-use code instead, exchanged for the session over HTTPS.
           *
           * This costs nothing here: verified in @supabase/auth-js 2.112.3 that `initialize()`
           * routes a PKCE callback through `_isPKCECallback` → `_exchangeCodeForSession`
           * automatically while `detectSessionInUrl` is on. So the app needs no redirect route and
           * no `verifyOtp` call of its own — which matters, because this SPA has no router to hang
           * one on.
           */
          flowType: 'pkce',
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** Whether this build can offer sign-in at all. Screens should ask before showing the entry point. */
export function isSyncConfigured(): boolean {
  return supabase !== null;
}
