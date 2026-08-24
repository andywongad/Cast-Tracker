import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { useSync } from '../hooks/useSync';
import { isSyncConfigured } from '../lib/supabase';
import { isAuthPreviewEnabled } from '../lib/auth';

/**
 * Who you are, in the chrome rather than two taps into Settings.
 *
 * Sign-in state was only legible inside the Settings sheet, which meant the app looked identical
 * signed in and signed out — and a failed sign-in looked exactly like a successful one. That is
 * not a hypothetical: a magic link that verified server-side but never established a session
 * produced an app that appeared normal, while nothing synced, for as long as nobody thought to
 * open Settings and check.
 *
 * Home screen only. On a show screen the title is the thing that needs the width, and a phone
 * cannot carry a back button, a title, an overflow menu, a gear and an address.
 */
function AccountButton() {
  const { session } = useAuth();
  const { state } = useSync();
  const { openAuth } = useUI();

  // Same condition the Settings sheet uses: a build with no backend shouldn't offer an account.
  if (!isSyncConfigured() && !isAuthPreviewEnabled()) return null;

  // The local part, because 38px of bar cannot hold an email and the domain is the part nobody
  // needs — the full address is one tap away, and stays in the label for screen readers.
  const name = session ? session.email.split('@')[0] : null;

  return (
    <button
      onClick={openAuth}
      aria-label={session ? `Signed in as ${session.email}` : 'Sign in'}
      style={{
        flex: 'none', height: 38, maxWidth: 132, padding: '0 12px', border: 'none', borderRadius: 12,
        background: 'var(--card)', boxShadow: 'var(--shadow-card)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 6,
        fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary)',
      }}
    >
      {/* Shown only when there is something to say. A permanent green dot reporting "fine" trains
          people to stop reading it, and then it cannot report anything else.

          Slate while syncing, red only when it failed. Both were warm at first, and `cta` against
          `danger` at 6px is two shades of the same red — the difference between "working" and
          "broken" cannot be a hue nobody can resolve at that size. */}
      {session && state !== 'idle' && state !== 'off' && (
        <span
          aria-hidden="true"
          style={{
            width: 6, height: 6, borderRadius: 999, flex: 'none',
            background: state === 'error' ? 'var(--danger)' : 'var(--accent)',
          }}
        />
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name ?? 'Sign in'}
      </span>
    </button>
  );
}

export default function TopBar() {
  const { showById } = useStore();
  const { screen, activeShowId, goHome, openSettings, openShowMenu } = useUI();
  const show = showById(activeShowId);
  const showBack = screen === 'show';

  return (
    <header className="ct-topbar">
      {showBack && (
        <button className="ct-iconbtn" onClick={goHome} aria-label="Back">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M12.5 4.5L6 10l6.5 5.5" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* One h1 per screen, naming where you are. The app had no headings at all, so a screen
            reader's heading navigation found nothing to jump to. */}
        {!showBack && <h1 className="ct-heading" style={{ fontSize: 24, margin: 0, fontWeight: 500 }}>Cast Tracker</h1>}
        {showBack && (
          <h1 className="ct-heading" style={{ fontSize: 20, margin: 0, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {show?.title || ''}
          </h1>
        )}
      </div>
      {showBack && (
        <button className="ct-iconbtn bordered" onClick={openShowMenu} aria-label="Show options">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="1.7" fill="var(--text-secondary)" />
            <circle cx="12" cy="12" r="1.7" fill="var(--text-secondary)" />
            <circle cx="19" cy="12" r="1.7" fill="var(--text-secondary)" />
          </svg>
        </button>
      )}
      {!showBack && <AccountButton />}
      <button className="ct-iconbtn bordered" onClick={openSettings} aria-label="Settings">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="var(--text-secondary)" strokeWidth="1.6" />
          <path d="M19.4 13a7.4 7.4 0 000-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.3 2.5a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a7.4 7.4 0 000 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 001.7 1L11 21h4l.3-2.5a7.6 7.6 0 001.7-1l2.4 1 2-3.5-2-1.5z" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </header>
  );
}
