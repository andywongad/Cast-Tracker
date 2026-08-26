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
  const { session, pending, error, awaitingEmail, requestLink, confirmSignIn, verifyCode, signOut, reset, simulated } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => { if (authOpen) { setEmail(''); setCode(''); reset(); } }, [authOpen, reset]);

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
                  We sent a code to <strong style={{ color: 'var(--text)' }}>{awaitingEmail}</strong>.
                  Type it in below — that works from any device, on any browser.
                  {/* The link is second on purpose, here and in the email. It is single-use, so
                      whatever fetches the message first spends it: a mail scanner opening it before
                      the recipient produces "link is invalid or has expired" for the person who
                      actually clicked. It also has to open in the browser that asked for it, since
                      the exchange needs a verifier stored there. A typed code has neither problem. */}
                  {' '}The mail also has a link, which only works in this browser and only once.
                </>
              )}
            </div>
            {/* Back, now that the email actually contains a code.
                It was removed once before for the right reason — the template sent a link only, so
                the field asked for something the message did not contain. Custom SMTP is what let
                `{{ .Token }}` into the templates, and this is the other half of that change. */}
            {!simulated && (
              <>
                <input
                  className="ct-type-lg"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) void verifyCode(code); }}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Sign-in code from your email"
                  style={{ width: '100%', height: 52, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', padding: '0 16px', fontSize: 20, fontWeight: 700, letterSpacing: '0.28em', marginBottom: 10, outline: 'none' }}
                />
                <button
                  onClick={() => void verifyCode(code)}
                  disabled={code.length !== 6 || pending}
                  className="ct-btn-primary ct-btn-primary-calm"
                  style={{ width: '100%', marginBottom: 10, opacity: code.length === 6 && !pending ? 1 : 0.5, cursor: code.length === 6 && !pending ? 'pointer' : 'not-allowed' }}
                >
                  {pending ? 'Signing in…' : 'Sign in'}
                </button>
              </>
            )}
            {simulated && (
              <button onClick={confirmSignIn} disabled={pending} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 10 }}>
                {pending ? 'Signing in…' : 'Simulate clicking the link'}
              </button>
            )}
            {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.5, marginBottom: 12 }}>{error}</div>}
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

            {error && <div style={{ fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.5, marginBottom: 12 }}>{error}</div>}

            <button onClick={() => requestLink(email)} disabled={!canSubmit} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 10 }}>
              {pending ? 'Sending…' : 'Continue with email'}
            </button>
            <button onClick={closeAuth} className="ct-btn-ghost" style={{ width: '100%' }}>Not now</button>
          </>
        )}
    </Sheet>
  );
}
