import { useEffect, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { isValidEmail } from '../lib/auth';
import Sheet from './Sheet';

/**
 * Sign-in screens. Three states: email entry, check-your-inbox, and signed in. No password field
 * anywhere — see the note in src/lib/auth.ts.
 *
 * The same screens serve the stub and the real backend, switched by `simulated` from useAuth. That
 * matters mostly for what they promise: a preview must say nothing is being created, and a real
 * one must not — a banner reading "nothing leaves this device" left on top of a working sync would
 * be a lie about where someone's data has gone.
 */
/** Shown only against the stub. Without it, testers give you feedback on a product that
 *  doesn't exist yet. */
function PreviewBanner() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--accent-tint)', borderRadius: 14, padding: '12px 14px', marginBottom: 20 }}>
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.3 }}>🚧</span>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text)' }}>Preview only.</strong> No account is created and nothing leaves this device.
        Your library still lives in this browser — sign-in doesn&rsquo;t back it up yet.
      </div>
    </div>
  );
}

export default function AuthSheet() {
  const { authOpen, closeAuth } = useUI();
  const { session, pending, error, awaitingEmail, requestLink, confirmSignIn, signOut, reset, simulated } = useAuth();
  const [email, setEmail] = useState('');

  useEffect(() => { if (authOpen) { setEmail(''); reset(); } }, [authOpen, reset]);

  if (!authOpen) return null;

  const canSubmit = isValidEmail(email) && !pending;

  return (
    <Sheet onClose={closeAuth} label="Account">

        {session ? (
          <>
            <div className="ct-sheet-title">You&rsquo;re signed in</div>
            {simulated && <PreviewBanner />}
            <label className="ct-label">Signed in as</label>
            <div style={{ fontSize: 15, marginBottom: 22 }}>{session.email}</div>
            <button onClick={signOut} disabled={pending} className="ct-btn-ghost" style={{ width: '100%' }}>
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : awaitingEmail ? (
          <>
            <div className="ct-sheet-title">Check your inbox</div>
            {simulated && <PreviewBanner />}
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 22 }}>
              {simulated ? (
                <>
                  We&rsquo;d send a sign-in link to <strong style={{ color: 'var(--text)' }}>{awaitingEmail}</strong>.
                  There&rsquo;s no mail server yet, so use the button below to stand in for clicking that link.
                </>
              ) : (
                <>
                  A sign-in link is on its way to <strong style={{ color: 'var(--text)' }}>{awaitingEmail}</strong>.
                  {/* Not a nicety. The link carries a code that is exchanged using a secret stored in
                      the browser that asked for it, so opening the mail in a different browser —
                      which is what tapping a link inside a mail app usually does on a phone —
                      lands you back here still signed out, with nothing explaining why. */}
                  {' '}Open it in <strong style={{ color: 'var(--text)' }}>this browser</strong>; a link opened
                  somewhere else won&rsquo;t sign you in.
                </>
              )}
            </div>
            {/* There was a code field here.
                Removed because the email template sends a link only, so it asked for something the
                message did not contain — a dead end with nothing on screen to explain it. The
                adapter's `verifyCode` is deliberately left in place: adding `{{ .Token }}` to the
                Supabase magic-link template is what makes a code exist, and bringing the field back
                is then a change to this file alone. */}
            {simulated && (
              <button onClick={confirmSignIn} disabled={pending} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 10 }}>
                {pending ? 'Signing in…' : 'Simulate clicking the link'}
              </button>
            )}
            {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
            <button onClick={reset} className="ct-btn-ghost" style={{ width: '100%' }}>Use a different email</button>
          </>
        ) : (
          <>
            <div className="ct-sheet-title">Keep your cast anywhere</div>
            {simulated && <PreviewBanner />}
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 20 }}>
              {simulated
                ? 'An account would let your shows follow you to another phone or laptop, and bring them back if you clear your browser.'
                : 'Your shows follow you to another phone or laptop, and come back if you clear your browser. You can keep using Cast Tracker without an account — signing in only adds this.'}
            </div>

            <label className="ct-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) requestLink(email); }}
              placeholder="you@example.com"
              className="ct-input"
              style={{ marginBottom: 8 }}
            />
            {/* No password field, by design — a stub can't protect one. */}
            <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 18 }}>
              No password &mdash; you&rsquo;ll get a one-time sign-in link by email.
            </div>

            {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}

            <button onClick={() => requestLink(email)} disabled={!canSubmit} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 10 }}>
              {pending ? 'Sending…' : 'Continue with email'}
            </button>
            <button onClick={closeAuth} className="ct-btn-ghost" style={{ width: '100%' }}>Not now</button>
          </>
        )}
    </Sheet>
  );
}
