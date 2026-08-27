import type { VercelRequest, VercelResponse } from '@vercel/node';
import webpush from 'web-push';
import {
  watchedShows,
  followersOf,
  getSubscription,
  getLead,
  alreadySent,
  markSent,
  forget,
} from './_lib/subscriptions.js';
import { scheduleFor, type ScheduledEpisode } from './_lib/schedule.js';

/**
 * Tells each follower about an episode at the moment they asked to be told.
 *
 * This used to run once a day and read TMDb's `last_episode_to_air.air_date` — a date, no time,
 * for an episode that had already gone out. It could only ever report the past, which made the
 * lead times the UI offers ("30 minutes before") undeliverable. Air times now come from TVmaze's
 * `airstamp` (see _lib/schedule.ts) and the schedule in vercel.json runs every fifteen minutes,
 * so "before" means before.
 *
 * The send decision is per recipient, not per show, because two people following the same show
 * have different answers: one wants a day's warning, one wants telling when it starts. So the
 * show is resolved once and the window is evaluated once per follower.
 *
 * ON CRON FREQUENCY. Nothing here assumes fifteen minutes. A run sends everything whose moment
 * has passed and has not been sent, so a coarser schedule makes notifications late rather than
 * wrong — on Vercel's Hobby plan, where cron fires once a day whatever the expression says, this
 * degrades to roughly the behaviour it replaced instead of breaking. Accuracy is bounded by the
 * interval; correctness is not.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;

/** How many shows to check at once. TMDb tolerates far more; TVmaze's ~20 calls/10s is the bound. */
const CONCURRENCY = 5;

/**
 * How long after an episode airs it is still worth mentioning.
 *
 * A run that was skipped, a deploy, a browser that was unreachable — the window has to be wider
 * than the gap between runs or a missed moment is missed forever. Two days is the old
 * `RECENT_DAYS` and it is safe to be generous because delivery is recorded per recipient: a wider
 * net catches what would have been lost and cannot produce a second notification.
 */
const GRACE_MS = 2 * 86_400_000;

function vapidReady(): boolean {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:hello@casttracker.app', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  return true;
}

/**
 * The episode this recipient should be told about now, or null.
 *
 * `airsAt - lead` is the moment they asked for; the grace window is the far edge. Candidates are
 * ordered upcoming-first by `scheduleFor`, so someone with a long lead gets the next episode while
 * someone with none gets the one that just aired, from the same pair.
 */
function dueFor(episodes: ScheduledEpisode[], leadMinutes: number, now: number): ScheduledEpisode | null {
  for (const ep of episodes) {
    const sendAt = ep.airsAt - leadMinutes * 60_000;
    if (now >= sendAt && now <= ep.airsAt + GRACE_MS) return ep;
  }
  return null;
}

/**
 * How far off it is, in the largest unit that is still true.
 *
 * Only for episodes with a real timestamp. A date-only fallback is read as midnight UTC, and
 * telling someone a show "airs in 40 minutes" on the strength of that would be a fabrication —
 * those get day-level wording instead.
 */
function whenWords(ep: ScheduledEpisode, now: number): string {
  const ms = ep.airsAt - now;
  if (ms <= 0) return 'is out now';

  if (!ep.exact) return ms < 36 * 3_600_000 ? 'airs today' : 'airs soon';

  const mins = Math.round(ms / 60_000);
  if (mins <= 1) return 'is starting now';
  if (mins < 60) return `airs in ${mins} minutes`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `airs in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `airs in ${days} ${days === 1 ? 'day' : 'days'}`;
}

function episodeLabel(ep: ScheduledEpisode): string {
  return ep.season && ep.number ? `Season ${ep.season}, Episode ${ep.number}` : 'A new episode';
}

async function notifyOne(
  endpoint: string,
  tmdbId: number,
  showTitle: string,
  episode: ScheduledEpisode,
  now: number,
): Promise<'sent' | 'skipped' | 'gone' | 'failed'> {
  if (await alreadySent(tmdbId, episode.key, endpoint)) return 'skipped';

  const subscription = await getSubscription(endpoint);
  // The endpoint is in a show's follower set but its subscription is gone — expired TTL, or a
  // half-finished removal. Clean it up rather than retrying it every run.
  if (!subscription) {
    await forget(endpoint);
    return 'gone';
  }

  const when = whenWords(episode, now);
  const label = episodeLabel(episode);

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
        title: when === 'is out now' ? `New episode of ${showTitle}` : `${showTitle} ${when}`,
        body: episode.name ? `${label} — ${episode.name}` : `${label} ${when}.`,
        showId: String(tmdbId),
        url: '/',
      }),
    );
    await markSent(tmdbId, episode.key, endpoint);
    return 'sent';
  } catch (err) {
    // 404 and 410 are the push service saying this browser is gone for good. Anything else —
    // a timeout, a 5xx — might work later, so the subscription stays and no mark is written,
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
  // The emptiness check is the point: with CRON_SECRET unset this compared against the string
  // "Bearer undefined", which anyone could send. Closed rather than open when unconfigured.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set; cannot check for episodes');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }
  if (!vapidReady()) {
    // Not an error worth failing the schedule over, but it must be loud: with no VAPID keys the
    // job would otherwise run, find episodes, and deliver nothing.
    console.error('VAPID keys are not set; no notifications can be delivered');
    return res.status(503).json({ error: 'Push is not configured' });
  }

  // Same keys as before, so anything reading the tally still works. `withNewEpisode` now counts
  // shows with an episode inside anyone's window rather than shows that aired yesterday.
  const tally = { shows: 0, withNewEpisode: 0, sent: 0, skipped: 0, gone: 0, failed: 0 };
  const now = Date.now();

  try {
    const shows = await watchedShows();
    tally.shows = shows.length;

    await pool(shows, CONCURRENCY, async (tmdbId) => {
      // Per show, so one bad response can't end the run for every other show — the failure mode
      // the original had, where a single throw aborted everything.
      try {
        const schedule = await scheduleFor(tmdbId, TMDB_API_KEY);
        if (!schedule?.episodes.length) return;

        const endpoints = await followersOf(tmdbId);
        let anyDue = false;

        for (const endpoint of endpoints) {
          // Per follower: the same pair of episodes lands differently for a one-hour lead and a
          // one-day lead, and on most runs neither is due for either of them.
          const lead = await getLead(endpoint, tmdbId);
          const episode = dueFor(schedule.episodes, lead, now);
          if (!episode) continue;
          anyDue = true;

          const outcome = await notifyOne(endpoint, tmdbId, schedule.title, episode, now);
          tally[outcome === 'sent' ? 'sent' : outcome === 'skipped' ? 'skipped' : outcome === 'gone' ? 'gone' : 'failed']++;
        }

        if (anyDue) tally.withNewEpisode++;
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
