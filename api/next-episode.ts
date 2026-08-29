import type { VercelRequest, VercelResponse } from '@vercel/node';
import { scheduleFor } from './_lib/schedule.js';

/**
 * When a show's next episode airs.
 *
 * GET /api/next-episode?showId=1396
 *
 * Exists because the client cannot answer this. TMDb gives the browser `next_episode_to_air
 * .air_date` — a date, no time, no zone — which is enough for the alert card to decide a show is
 * still running (what it already uses it for) and not enough to tell anyone when to be on the
 * sofa. The real timestamp is TVmaze's `airstamp`, reached through the TMDb -> TVmaze id chain
 * that needs a TMDb key and therefore has to happen here.
 *
 * Deliberately built on scheduleFor(), the same function the episode cron uses, rather than a
 * second implementation of the same lookup. The card and the notification then cannot disagree
 * about when a show is on — which they would eventually, and silently, if this resolved the id
 * and read the embed itself. It also inherits the KV-cached id and the TMDb fallback for shows
 * TVmaze has never heard of.
 *
 * `exact` is passed through untouched. It is what stops the card printing a clock time off a date
 * that never had one; see airWords() in src/lib/airTime.ts.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;

/**
 * An hour fresh, a day stale.
 *
 * Shorter than the day this route's neighbours use, because this answer expires on its own: the
 * "next" episode becomes the previous one the moment it airs, and a card confidently naming a
 * time that has passed is worse than a card naming none. `stale-while-revalidate` means nobody
 * waits for the refresh either way.
 */
const CACHE_CONTROL = 's-maxage=3600, stale-while-revalidate=86400';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = typeof req.query.showId === 'string' ? req.query.showId : '';
  const showId = Number(raw);
  if (!raw || !Number.isInteger(showId) || showId <= 0) {
    return res.status(400).json({ error: 'showId must be a positive integer' });
  }
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set; /api/next-episode cannot resolve a schedule');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }

  const { schedule, reason } = await scheduleFor(showId, TMDB_API_KEY);

  // An upstream refusing to answer is not the same as a show with nothing scheduled, and must not
  // be cached as one — a revoked key would otherwise pin "no next episode" onto every show for a
  // day. Mirrors the distinction scheduleFor draws for the cron.
  if (reason) return res.status(503).json({ error: 'Could not read the schedule' });

  /**
   * scheduleFor returns the upcoming episode *and* the one that just aired, because the cron needs
   * both to serve different lead times. A card asking "when is it next on" wants only the one that
   * hasn't happened yet.
   */
  const next = (schedule?.episodes ?? []).find((ep) => ep.airsAt > Date.now()) ?? null;

  res.setHeader('Cache-Control', CACHE_CONTROL);
  return res.status(200).json(
    next
      ? {
          airsAt: next.airsAt,
          exact: next.exact,
          season: next.season,
          number: next.number,
          name: next.name,
        }
      // A normal outcome — between seasons, or finished. Cached as hard as an answer, or every
      // open of a between-seasons show re-runs the whole chain to learn the same nothing.
      : { airsAt: null },
  );
}
