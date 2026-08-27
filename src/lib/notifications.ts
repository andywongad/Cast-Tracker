/**
 * Whether this deployment can deliver a push at all.
 *
 * Without a VAPID key the browser cannot even be asked to subscribe, so every attempt ends at
 * `ensureSubscription`'s "not configured" throw — and the nightly job has no keys to sign with
 * either. The UI reads this to hide the notification control rather than offer one that can only
 * fail. Nothing is disabled or deleted: set `VITE_VAPID_PUBLIC_KEY` (plus the server's
 * `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `CRON_SECRET`) and redeploy, and it comes back.
 */
export const PUSH_CONFIGURED = !!import.meta.env.VITE_VAPID_PUBLIC_KEY;

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

/**
 * iOS and iPadOS, where every browser is WebKit underneath and the Home Screen rule applies
 * whichever one is installed.
 *
 * iPadOS reports a Mac user agent, so touch points are what separates it from a desktop Safari
 * that genuinely cannot do this.
 */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  );
}

/**
 * iPad, which puts Share in the toolbar along the top and has no bottom menu at all.
 *
 * Worth telling apart, because the alternative is sending an iPad user to hunt at the bottom of a
 * screen where the button is at the top. iPadOS reports a Mac user agent — the touch-point check
 * is what catches it — while an iPhone says so plainly.
 */
function isIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // First, and not merely for speed: an iPhone's user agent reads "CPU iPhone OS 18_0 like
  // Mac OS X", so a substring test for Mac matches it, and the touch-point check cannot separate
  // them. Without this an iPhone is told to look in a toolbar it does not have.
  if (/iPhone|iPod/.test(ua)) return false;
  if (/iPad/.test(ua)) return true;
  // Macintosh, not Mac, for the same reason.
  return ua.includes('Macintosh') && navigator.maxTouchPoints > 1;
}

/**
 * Where "Add to Home Screen" is, on the device actually holding the phone.
 *
 * Deliberately anchored on the Share sheet rather than on one version's exact chrome. The route
 * to Share moved in iOS 18 — into a ⋯ menu, where it used to sit directly in the toolbar — and
 * the layout moves again if someone puts the address bar back at the top. What has not changed in
 * a decade is that Add to Home Screen lives in the Share sheet, below the row of apps, sometimes
 * behind "View More". So the instruction names the destination and gives the common route to it.
 *
 * There is no shortcut to offer instead: iOS exposes no URL scheme or API that opens the Share
 * sheet or triggers this action, and `beforeinstallprompt` — the one-tap install other platforms
 * have — is Chrome and Android only. Telling someone where to tap is the whole of what is
 * available.
 */
function addToHomeScreenSteps(): string {
  return isIPad()
    ? 'Tap the Share button in the toolbar at the top, then scroll down to "Add to Home Screen".'
    : 'Tap the ⋯ button at the bottom right, then Share, then "Add to Home Screen" — you may need "View More" to see it.';
}

export type HomeScreenHint = 'iphone' | 'ipad';

/**
 * Which device's Home Screen instructions to show, or null when there is nothing to explain.
 *
 * Exported so the card can say this *before* someone taps Turn on. As an error afterwards it is
 * an ambush: the options and the button were offered, they were used, and only then does the app
 * mention that none of it could have worked in a browser tab.
 *
 * The absence of PushManager is the test rather than any version sniffing. On Apple's mobile
 * platforms it is missing exactly when the site is not installed, so this is the condition itself
 * rather than a guess at it — and everywhere else a missing PushManager means genuinely
 * unsupported, which is a different message.
 */
export function homeScreenHint(): HomeScreenHint | null {
  if (typeof window === 'undefined') return null;
  if ('PushManager' in window) return null;
  if (!isAppleMobile()) return null;
  return isIPad() ? 'ipad' : 'iphone';
}

/** Running from the Home Screen rather than in a browser tab. */
function isInstalled(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/**
 * The browser's existing push subscription, or a new one. Null when the user says no.
 *
 * The three ways this can be impossible are told apart, because "not supported in this browser"
 * was true in the narrowest sense and useless in every other: on an iPhone it is the message
 * shown to someone two taps away from it working, and it reads as a dead end rather than as an
 * instruction. Safari exposes PushManager only to a site added to the Home Screen, so a normal
 * tab fails this check no matter what the server does.
 */
async function ensureSubscription(): Promise<PushSubscription | null> {
  // Checked first: service workers are absent outside a secure context, so this would otherwise
  // surface as "your browser can't do this" to someone whose browser can, over plain http on a
  // phone pointed at a dev server.
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('Notifications need a secure (https) connection. Open the app at casttracker.app.');
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    if (isAppleMobile() && !isInstalled()) {
      throw new Error(
        `Notifications on ${isIPad() ? 'iPad' : 'iPhone'} only work from the Home Screen. ` +
          `${addToHomeScreenSteps()} Then open Cast Tracker from that new icon and turn alerts on there.`,
      );
    }
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

/**
 * `leadMinutes` is how long before the episode the person asked to be told, and it is sent on
 * every call rather than only the first: this is the same request that changes an existing
 * choice, so a follow and a re-follow have to look identical to the server.
 *
 * The server records it. It cannot act on it yet — the nightly job reads TMDb's `air_date`, which
 * is a date, for an episode that has already gone out — so today the number is stored and
 * delivery is unchanged. See the header of src/lib/episodeAlerts.ts.
 */
export async function followShowNotifications(showTmdbId: number, leadMinutes = 0): Promise<boolean> {
  const subscription = await ensureSubscription();
  if (!subscription) return false;

  const res = await fetch('/api/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, showTmdbId, leadMinutes }),
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
