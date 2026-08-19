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
                  We&rsquo;ve emailed <strong style={{ color: 'var(--text)' }}>{awaitingEmail}</strong> a sign-in code.
                  Enter it below. There&rsquo;s a link in that email too, if you&rsquo;d rather tap it.
                </>
              )}
            </div>
            {simulated ? (
              <button onClick={confirmSignIn} disabled={pending} className="ct-btn-primary" style={{ width: '100%', marginBottom: 10 }}>
                {pending ? 'Signing in…' : 'Simulate clicking the link'}
              </button>
            ) : (
              <>
                <label className="ct-label" htmlFor="auth-code">Code</label>
                <input
                  id="auth-code"
                  // `text` with a numeric inputMode rather than type="number": a number field on
                  // mobile brings a spinner and strips leading zeros, and a code can begin with one.
                  type="text"
                  inputMode="numeric"
                  // Lets iOS and Android offer the code straight from the notification.
                  autoComplete="one-time-code"
                  autoFocus
                  // Not fixed at 6. Supabase's OTP length is configurable and this project's
                  // currently issues 8, so a hardcoded 6 silently truncated a valid code and left
                  // the button disabled with no way to proceed.
                  maxLength={10}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && code.length >= 6 && !pending) verifyCode(code); }}
                  placeholder="12345678"
                  className="ct-input"
                  style={{ marginBottom: 14, letterSpacing: '0.35em', fontVariantNumeric: 'tabular-nums' }}
                />
                {error && <div style={{ fontSize: 12.5, color: '#C24B4B', marginBottom: 12 }}>{error}</div>}
                <button
                  onClick={() => verifyCode(code)}
                  disabled={code.length < 6 || pending}
                  className="ct-btn-primary"
                  style={{ width: '100%', marginBottom: 10 }}
                >
                  {pending ? 'Signing in…' : 'Sign in'}
                </button>
              </>
            )}
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
              {simulated ? 'No password — you\u2019d get a one-time sign-in link by email.' : 'No password. We\u2019ll email you a one-time sign-in link.'}
            </div>

            {error && <div style={{ fontSize: 12.5, color: '#C24B4B', marginBottom: 12 }}>{error}</div>}

            <button onClick={() => requestLink(email)} disabled={!canSubmit} className="ct-btn-primary" style={{ width: '100%', marginBottom: 10 }}>
              {pending ? 'Sending…' : 'Continue with email'}
            </button>
            <button onClick={closeAuth} className="ct-btn-ghost" style={{ width: '100%' }}>Not now</button>
          </>
        )}
    </Sheet>
  );
}
