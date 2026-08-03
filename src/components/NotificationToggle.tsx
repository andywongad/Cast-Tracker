import { useState, useEffect } from 'react';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, isSubscribed } from '../lib/notifications';

export default function NotificationToggle({ showId }: { showId: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, [showId]);

  const checkSubscription = async () => {
    try {
      const isActive = await isSubscribed();
      setSubscribed(isActive);
    } catch {
      setSubscribed(false);
    }
  };

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPushNotifications();
        setSubscribed(false);
      } else {
        await subscribeToPushNotifications();
        setSubscribed(true);
      }
    } catch (error) {
      console.error('Notification toggle error:', error);
      alert('Failed to update notification settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      style={{
        height: 44,
        padding: '0 16px',
        border: '1px solid var(--input-border)',
        borderRadius: 12,
        background: subscribed ? '#6366F1' : 'transparent',
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
  );
}
