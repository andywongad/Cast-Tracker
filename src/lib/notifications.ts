export async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      // Dev only. Vite substitutes a literal false here in a production build and esbuild drops
      // the branch, so neither the call nor its string ships. Failures below still log: an error
      // a tester can read back to you is worth more than a clean console.
      if (import.meta.env.DEV) console.info('[sw] registered', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }
  return null;
}

export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

/**
 * Push is per show, not per browser.
 *
 * These used to ignore which show they were called for: subscribing stored a browser with no
 * record of what it wanted, and `isSubscribed` answered "does this browser have any subscription
 * at all", so turning notifications on for one show lit the toggle on every show. The server had
 * no way to know what to send, which is the reason the nightly job had nothing to iterate.
 *
 * The browser-level push subscription is still one object — that's how the Push API works — but
 * the set of shows it follows now lives on the server, keyed by its endpoint.
 */

/** The browser's existing push subscription, or a new one. Null when the user says no. */
async function ensureSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser');
  }
  const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    // Without this the call below throws an opaque DOMException. Say which piece is missing.
    throw new Error('Push is not configured for this deployment');
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) return existing;

  if (!(await requestNotificationPermission())) return null;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });
}

export async function followShowNotifications(showTmdbId: number): Promise<boolean> {
  const subscription = await ensureSubscription();
  if (!subscription) return false;

  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, showTmdbId }),
  });
  if (!res.ok) throw new Error('Could not save that notification setting');
  return true;
}

export async function unfollowShowNotifications(showTmdbId: number): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch('/api/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, showTmdbId }),
  });
  // The browser subscription itself is deliberately left alone — other shows may still be using
  // it, and dropping it here would silently unfollow all of them.
}

/** Whether this browser follows this particular show. The server is the source of truth. */
export async function followsShowNotifications(showTmdbId: number): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return false;

  try {
    const qs = new URLSearchParams({ showId: String(showTmdbId), endpoint: subscription.endpoint });
    const res = await fetch(`/api/subscribe?${qs.toString()}`);
    if (!res.ok) return false;
    return !!(await res.json()).following;
  } catch {
    return false;
  }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
