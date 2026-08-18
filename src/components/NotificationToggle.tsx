import { useState, useEffect } from 'react';
import { followShowNotifications, unfollowShowNotifications, followsShowNotifications } from '../lib/notifications';

/**
 * Takes the show's TMDb id, not its local id.
 *
 * It used to take the local id and never read it — the state came from "does this browser have
 * any push subscription", so switching notifications on for one show showed them as on for every
 * show, and nothing recorded what the user had actually asked for. The TMDb id is what the server
 * and the nightly job key on, so it's what has to come in.
 *
 * A show with no TMDb id can't be followed: there's nothing to check for new episodes against.
 */
export default function NotificationToggle({ showTmdbId }: { showTmdbId: number | null }) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!showTmdbId) { setSubscribed(false); return; }
    followsShowNotifications(showTmdbId)
      .then((v) => { if (alive) setSubscribed(v); })
      .catch(() => { if (alive) setSubscribed(false); });
    return () => { alive = false; };
  }, [showTmdbId]);

  const handleToggle = async () => {
    if (!showTmdbId) return;
    setLoading(true);
    setError(null);
    try {
      if (subscribed) {
        await unfollowShowNotifications(showTmdbId);
        setSubscribed(false);
      } else {
        // False means the browser prompt was declined — not an error, just nothing to report.
        setSubscribed(await followShowNotifications(showTmdbId));
      }
    } catch (err) {
      // Replaces an alert(). A blocking dialog for a setting nobody asked twice about is a lot,
      // and it says nothing about which part failed.
      setError(err instanceof Error ? err.message : 'Could not update notifications');
    } finally {
      setLoading(false);
    }
  };

  if (!showTmdbId) return null;

  return (
    <>
    <button
      onClick={handleToggle}
      disabled={loading}
      style={{
        height: 44,
        padding: '0 16px',
        border: '1px solid var(--input-border)',
        borderRadius: 12,
        background: subscribed ? 'var(--accent)' : 'transparent',
        color: subscribed ? '#fff' : 'var(--text-secondary)',
        fontSize: 13.5,
        fontWeight: 700,
        cursor: loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      {subscribed ? '🔔' : '🔕'} {subscribed ? 'Notifications On' : 'Enable Notifications'}
    </button>
    {error && (
      <div style={{ fontSize: 12.5, color: '#C24B4B', lineHeight: 1.45, marginTop: 8 }}>{error}</div>
    )}
    </>
  );
}
