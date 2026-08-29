import type { VercelRequest, VercelResponse } from '@vercel/node';
import { recapKey } from './_lib/recap-key.js';
import { fetchRecapSource } from './_lib/recap-source.js';
import { generateRecap } from './_lib/generate-recap.js';
import {
  kvRecapStore,
  underGenerationLimit,
  underGlobalGenerationLimit,
  NO_RECAP_SOURCE_TTL_SECONDS,
  REFUSAL_TTL_SECONDS,
} from './_lib/store-kv.js';

/**
 * Check-then-generate endpoint for "previously on" recaps.
 *
 * GET /api/recap?showId=1398&showTitle=The%20Sopranos&season=2&episode=6
 *
 * `episode` is the last episode the reader has already watched, inclusive — the recap covers the
 * season up to and including it. The caller resolves it to a real number before asking; this
 * endpoint will not accept "whatever the last one was", because two spellings of the same request
 * would cache the same paragraph twice.
 *
 * Deliberately the same shape as api/enrichment.ts — allowlist the inputs, keep the keys
 * server-side, never pass an upstream error body back to the client, cache the negative answers —
 * so there is one pattern here to understand rather than two.
 *
 * The economics: the key is (show, season, episode) and nothing else, so one generation serves
 * every reader who ever reaches that point in that show. See api/_lib/recap-key.ts.
 */

/**
 * Generations per IP per day. Cache hits don't count — only calls that reach the model.
 *
 * Lower than enrichment's 60 because a recap is a bigger call: a season of source text in, a
 * paragraph of reasoning out, on a more expensive model. Someone catching up on a show they left
 * a year ago might reasonably want a handful in one sitting; twenty is well past that.
 */
const MAX_RECAPS_PER_DAY = 20;

/**
 * The whole deployment's ceiling for one day.
 *
 * Sized on cost rather than volume: at several times the tokens of a bio, this is roughly the same
 * daily spend as enrichment's 400. Raise it when real traffic says so — the log line in
 * `underGlobalGenerationLimit` is what tells you.
 */
const MAX_RECAPS_PER_DAY_GLOBAL = 150;

/** Counter namespace, kept off enrichment's so neither can starve the other. */
const RATE_SCOPE = 'recap';

const MAX_TITLE_LENGTH = 200;
/** TMDb's longest seasons are in the low hundreds of episodes; this is far past any real show. */
const MAX_EPISODE_NUMBER = 2000;

function firstParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? '';
  return typeof v === 'string' ? v : '';
}

function clientIp(req: VercelRequest): string {
  const fwd = firstParam(req.headers['x-forwarded-for']);
  return fwd.split(',')[0].trim() || 'unknown';
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const showId = Number.parseInt(firstParam(req.query.showId), 10);
  const showTitle = firstParam(req.query.showTitle).trim().slice(0, MAX_TITLE_LENGTH);
  const season = Number.parseInt(firstParam(req.query.season), 10);
  const episode = Number.parseInt(firstParam(req.query.episode), 10);

  if (!Number.isInteger(showId) || showId <= 0 || !showTitle) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  if (!Number.isInteger(episode) || episode < 1 || episode > MAX_EPISODE_NUMBER) {
    return res.status(400).json({ error: 'Missing or invalid episode' });
  }

  const key = recapKey({ showTmdbId: showId, season, throughEpisode: episode });
  if (!key) {
    return res.status(400).json({ error: 'Could not identify that point in the show' });
  }

  // ---- Cached? -------------------------------------------------------------
  const cached = await kvRecapStore.get(key);
  if (cached?.status === 'ready') {
    // Immutable once generated — the episodes it covers are fixed — so let the edge serve repeats
    // without waking a function.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(cached.data);
  }
  if (cached?.status === 'unavailable') {
    // A known dead end. Answering from the marker skips a pointless TMDb round trip.
    return res.status(404).json({ error: 'unavailable', reason: cached.reason });
  }

  // ---- Generate ------------------------------------------------------------
  if (!(await underGenerationLimit(clientIp(req), MAX_RECAPS_PER_DAY, RATE_SCOPE))) {
    res.setHeader('Retry-After', '3600');
    return res
      .status(429)
      .json({ error: 'rate_limited', scope: 'client', reason: 'Too many recaps written from here today.' });
  }
  if (!(await underGlobalGenerationLimit(MAX_RECAPS_PER_DAY_GLOBAL, RATE_SCOPE))) {
    res.setHeader('Retry-After', '3600');
    return res
      .status(429)
      .json({ error: 'rate_limited', scope: 'global', reason: 'Cast Tracker has written as many recaps as it can today.' });
  }

  const { fetched, source } = await fetchRecapSource({ showTmdbId: showId, season, throughEpisode: episode });

  if (!source) {
    /**
     * Two different failures wear the same face here, and only one of them is cacheable. A season
     * TMDb answered for, whose overviews are too thin to recap, is a fact about the show and worth
     * remembering. A season TMDb didn't answer for at all is a fact about this minute — caching it
     * would turn a blip into a season that can never be recapped.
     */
    if (fetched) {
      await kvRecapStore.putUnavailable(key, 'thin_source', NO_RECAP_SOURCE_TTL_SECONDS);
      return res.status(404).json({ error: 'unavailable', reason: 'thin_source' });
    }
    return res.status(503).json({ error: 'Could not read the season yet' });
  }

  const result = await generateRecap({ showTitle, season, throughEpisode: episode, source });

  if (!result.ok) {
    // Only permanent outcomes are cached, exactly as in enrichment.
    if (result.permanent) {
      await kvRecapStore.putUnavailable(key, result.reason, REFUSAL_TTL_SECONDS);
      return res.status(404).json({ error: 'unavailable', reason: result.reason });
    }
    console.error('recap generation failed', result.reason);
    return res.status(503).json({ error: 'Could not write a recap yet' });
  }

  await kvRecapStore.putReady(key, result.data);
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(result.data);
}
