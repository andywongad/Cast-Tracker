import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import {
  watchedShows,
  followersOf,
  getSubscription,
  alreadySent,
  markSent,
  forget,
} from './_lib/subscriptions.js';

/**
 * Daily check for episodes that have just aired, and a push to whoever asked about that show.
 *
 * This is a rewrite. The previous version could not have worked: it requested
 * `/tv/{id}/season/latest`, which is not a TMDb endpoint and answers 400; it iterated `show:*`
 * keys that nothing ever wrote; it called JSON.parse on a value @vercel/kv had already
 * deserialized, which threw inside a try that wrapped the entire run; and it posted to
 * `fcm.googleapis.com/fcm/send`, the legacy FCM endpoint Google decommissioned in June 2024,
 * passing a Web Push encryption key as if it were an FCM token. Nothing about it was salvageable
 * except the schedule.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

/** How many shows to check at once. TMDb tolerates far more; this is about staying polite. */
const CONCURRENCY = 5;

/**
 * An episode counts as new if it aired in this window, not if its date equals today.
 *
 * TMDb's air_date is the broadcaster's local date, and this runs at 06:00 UTC, so an episode that
 * aired last night in Los Angeles or this evening in Seoul does not match a UTC "today". A window
 * also absorbs a run that was skipped or failed. It is only safe to widen because delivery is
 * recorded per recipient below — a wider net cannot produce a second notification, only catch one
 * that would otherwise have been missed.
 */
const RECENT_DAYS = 2;

interface TmdbEpisode {
  id: number;
  name?: string;
  air_date?: string;
  season_number?: number;
  episode_number?: number;
}

function vapidReady(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:hello@casttracker.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

function airedRecently(airDate: string | undefined): boolean {
  if (!airDate) return false;
  const aired = Date.parse(`${airDate}T00:00:00Z`);
  if (Number.isNaN(aired)) return false;
  const now = Date.now();
  return aired <= now && now - aired <= RECENT_DAYS * 86_400_000;
}

/** The show's latest aired episode, or null. One request, and the only TMDb call per show. */
async function latestAired(tmdbId: number): Promise<{ title: string; episode: TmdbEpisode } | null> {
  const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { name?: string; last_episode_to_air?: TmdbEpisode | null };
  const episode = data.last_episode_to_air;
  if (!episode?.id || !airedRecently(episode.air_date)) return null;
  return { title: data.name || 'A show you follow', episode };
}

async function notifyOne(
  endpoint: string,
  tmdbId: number,
  showTitle: string,
  episode: TmdbEpisode,
): Promise<'sent' | 'skipped' | 'gone' | 'failed'> {
  if (await alreadySent(tmdbId, episode.id, endpoint)) return 'skipped';

  const subscription = await getSubscription(endpoint);
  // The endpoint is in a show's follower set but its subscription is gone — expired TTL, or a
  // half-finished removal. Clean it up rather than retrying it every night.
  if (!subscription) {
    await forget(endpoint);
    return 'gone';
  }

  const label =
    episode.season_number && episode.episode_number
      ? `Season ${episode.season_number}, Episode ${episode.episode_number}`
      : 'A new episode';

  try {
    await webpush.sendNotification(
      subscription,
      /**
       * Flat, because that is the shape public/service-worker.js already reads: it takes
       * `title`, `body`, `showId` and `url` from the top level. Nesting them under `data` — the
       * shape the old code sent — left `tag` undefined, so notifications for the same show would
       * stack instead of replacing each other. Matching the worker is safer than changing it;
       * a service worker lives in browsers we don't control until it next updates.
       */
      JSON.stringify({
        title: `New episode of ${showTitle}`,
        body: episode.name ? `${label} — ${episode.name}` : `${label} is out.`,
        showId: String(tmdbId),
        url: '/',
      }),
    );
    await markSent(tmdbId, episode.id, endpoint);
    return 'sent';
  } catch (err) {
    // 404 and 410 are the push service saying this browser is gone for good. Anything else —
    // a timeout, a 5xx — might work tomorrow, so the subscription stays and no mark is written,
    // which means the next run retries exactly this recipient and nobody else.
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) {
      await forget(endpoint);
      return 'gone';
    }
    console.error(`push failed for show ${tmdbId}`, status ?? err);
    return 'failed';
  }
}

async function pool<T>(items: T[], width: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        await work(items[i]);
      }
    }),
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set; cannot check for episodes');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }
  if (!vapidReady()) {
    // Not an error worth failing the schedule over, but it must be loud: with no VAPID keys the
    // job would otherwise run every day, find episodes, and deliver nothing.
    console.error('VAPID keys are not set; no notifications can be delivered');
    return res.status(503).json({ error: 'Push is not configured' });
  }

  const tally = { shows: 0, withNewEpisode: 0, sent: 0, skipped: 0, gone: 0, failed: 0 };

  try {
    const shows = await watchedShows();
    tally.shows = shows.length;

    await pool(shows, CONCURRENCY, async (tmdbId) => {
      // Per show, so one bad response can't end the run for every other show — the failure mode
      // the previous version had, where a single throw aborted everything.
      try {
        const latest = await latestAired(tmdbId);
        if (!latest) return;
        tally.withNewEpisode++;

        const endpoints = await followersOf(tmdbId);
        for (const endpoint of endpoints) {
          const outcome = await notifyOne(endpoint, tmdbId, latest.title, latest.episode);
          tally[outcome === 'sent' ? 'sent' : outcome === 'skipped' ? 'skipped' : outcome === 'gone' ? 'gone' : 'failed']++;
        }
      } catch (err) {
        tally.failed++;
        console.error(`check failed for show ${tmdbId}`, err);
      }
    });

    return res.status(200).json({ ok: true, ...tally });
  } catch (err) {
    console.error('check-episodes failed', err);
    return res.status(500).json({ error: 'Failed to check episodes', ...tally });
  }
}
