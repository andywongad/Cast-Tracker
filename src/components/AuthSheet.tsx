import { useEffect, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { isValidEmail } from '../lib/auth';

/**
 * Sign-up / sign-in screens for the auth preview. Three states: email entry, check-your-inbox,
 * and signed in. No password field anywhere — see the note in src/lib/auth.ts.
 *
 * The banner is not decoration. Anyone testing this needs to know nothing is being created,
 * or the feedback you get back will be about a product that doesn't exist.
 */
function PreviewBanner() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--accent-tint)', borderRadius: 14, padding: '12px 14px', marginBottom: 20 }}>
      <span aria-hidden="true" style={{ fontSize: 14, lineHeight: 1.3 }}>🚧</span>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text)' }}>Preview only.</strong> No account is created and nothing leaves this device.
        Your library still lives in this browser — sign-in doesn&rsquo;t back it up yet.
      </div>
    </div>
  );
}

export default function AuthSheet() {
  const { authOpen, closeAuth } = useUI();
  const { session, pending, error, awaitingEmail, requestLink, confirmSignIn, signOut, reset } = useAuth();
  const [email, setEmail] = useState('');

  useEffect(() => { if (authOpen) { setEmail(''); reset(); } }, [authOpen, reset]);

  if (!authOpen) return null;

  const canSubmit = isValidEmail(email) && !pending;

  return (
    <div className="ct-scrim" onClick={closeAuth}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />

        {session ? (
          <>
            <div className="ct-sheet-title">You&rsquo;re signed in</div>
            <PreviewBanner />
            <label className="ct-label">Signed in as</label>
            <div style={{ fontSize: 15, marginBottom: 22 }}>{session.email}</div>
            <button onClick={signOut} disabled={pending} className="ct-btn-ghost" style={{ width: '100%' }}>
              {pending ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : awaitingEmail ? (
          <>
            <div className="ct-sheet-title">Check your inbox</div>
            <PreviewBanner />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 22 }}>
              We&rsquo;d send a sign-in link to <strong style={{ color: 'var(--text)' }}>{awaitingEmail}</strong>.
              There&rsquo;s no mail server yet, so use the button below to stand in for clicking that link.
            </div>
            <button onClick={confirmSignIn} disabled={pending} className="ct-btn-primary" style={{ width: '100%', marginBottom: 10 }}>
              {pending ? 'Signing in…' : 'Simulate clicking the link'}
            </button>
            <button onClick={reset} className="ct-btn-ghost" style={{ width: '100%' }}>Use a different email</button>
          </>
        ) : (
          <>
            <div className="ct-sheet-title">Keep your cast anywhere</div>
            <PreviewBanner />
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 20 }}>
              An account would let your shows follow you to another phone or laptop, and bring them back if
              you clear your browser.
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
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 18 }}>
              No password — you&rsquo;d get a one-time sign-in link by email.
            </div>

            {error && <div style={{ fontSize: 12.5, color: '#C24B4B', marginBottom: 12 }}>{error}</div>}

            <button onClick={() => requestLink(email)} disabled={!canSubmit} className="ct-btn-primary" style={{ width: '100%', marginBottom: 10 }}>
              {pending ? 'Sending…' : 'Continue with email'}
            </button>
            <button onClick={closeAuth} className="ct-btn-ghost" style={{ width: '100%' }}>Not now</button>
          </>
        )}
      </div>
    </div>
  );
}
