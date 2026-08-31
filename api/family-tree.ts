import type { VercelRequest, VercelResponse } from '@vercel/node';
import { treeKey } from './_lib/tree-key.js';
import { stripEvidence } from '../src/lib/familyTree/verify.js';
import { fetchTreeSource } from './_lib/tree-source.js';
import { generateTree } from './_lib/generate-tree.js';
import {
  kvTreeStore,
  underGenerationLimit,
  underGlobalGenerationLimit,
  NO_TREE_SOURCE_TTL_SECONDS,
  REFUSAL_TTL_SECONDS,
} from './_lib/store-kv.js';

/**
 * Check-then-generate endpoint for a seeded family tree.
 *
 * GET /api/family-tree?showId=1399&showTitle=Game%20of%20Thrones&season=1&episode=1
 *
 * Deliberately the same shape as api/enrichment.ts and api/recap.ts — allowlist the inputs, keep
 * the keys server-side, never pass an upstream error body back to the client, cache the negative
 * answers. Three features, one pattern to understand.
 *
 * `episode` is the episode the tree describes, not a range. A tree is a snapshot of what one
 * episode has established; asking again from a later one is a different key.
 *
 * Note what this handler does NOT accept: the caller's cast list. The generation runs against
 * TMDb's credits for the episode, which is the list everybody's copy was made from — see the
 * reasoning in api/_lib/tree-key.ts. The names are returned with the tree so each client can match
 * them back to its own record ids.
 */

/**
 * Generations per IP per day.
 *
 * The lowest of the three, and it does not need to be higher: a tree is asked for once per show,
 * at import, not once per character or once per episode reached. Someone setting up ten new shows
 * in one sitting is already an unusual day.
 */
const MAX_TREES_PER_DAY = 10;

/**
 * The whole deployment's ceiling for one day.
 *
 * Sized on cost like its neighbours. A tree is the most expensive single call of the three — a
 * roster, a page of prose, high effort — but the rarest per user, and every generation is shared
 * by everyone who ever imports that show. Raise it when real traffic says so; the log line in
 * `underGlobalGenerationLimit` is what tells you.
 */
const MAX_TREES_PER_DAY_GLOBAL = 100;

/** Counter namespace, kept off the others so none of the three can starve another. */
const RATE_SCOPE = 'tree';

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

  const key = treeKey({ showTmdbId: showId, season, asOfEpisode: episode });
  if (!key) {
    return res.status(400).json({ error: 'Could not identify that point in the show' });
  }

  // ---- Cached? -------------------------------------------------------------
  const cached = await kvTreeStore.get(key);
  if (cached?.status === 'ready') {
    // Immutable once generated — the episode it describes is fixed — so let the edge serve repeats
    // without waking a function.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(stripEvidence(cached.data));
  }
  if (cached?.status === 'unavailable') {
    // A known dead end. Answering from the marker skips two pointless round trips.
    return res.status(404).json({ error: 'unavailable', reason: cached.reason });
  }

  // ---- Generate ------------------------------------------------------------
  if (!(await underGenerationLimit(clientIp(req), MAX_TREES_PER_DAY, RATE_SCOPE))) {
    res.setHeader('Retry-After', '3600');
    return res
      .status(429)
      .json({ error: 'rate_limited', scope: 'client', reason: 'Too many family trees drawn from here today.' });
  }
  if (!(await underGlobalGenerationLimit(MAX_TREES_PER_DAY_GLOBAL, RATE_SCOPE))) {
    res.setHeader('Retry-After', '3600');
    return res
      .status(429)
      .json({ error: 'rate_limited', scope: 'global', reason: 'Cast Tracker has drawn as many family trees as it can today.' });
  }

  const { fetched, source } = await fetchTreeSource({
    showTmdbId: showId,
    showTitle,
    season,
    asOfEpisode: episode,
  });

  if (!source) {
    /**
     * The same two-faced failure api/recap.ts describes, and the same split. A show whose article
     * has no relationship prose in it is a fact about the show and worth remembering. An upstream
     * that did not answer is a fact about this minute — caching it would turn a blip into a show
     * that can never have a tree.
     */
    if (fetched) {
      await kvTreeStore.putUnavailable(key, 'no_relational_source', NO_TREE_SOURCE_TTL_SECONDS);
      return res.status(404).json({ error: 'unavailable', reason: 'no_relational_source' });
    }
    return res.status(503).json({ error: 'Could not read that episode yet' });
  }

  const result = await generateTree({ showTitle, season, asOfEpisode: episode, source });

  if (!result.ok) {
    // Only permanent outcomes are cached, exactly as in the other two.
    if (result.permanent) {
      await kvTreeStore.putUnavailable(key, result.reason, REFUSAL_TTL_SECONDS);
      return res.status(404).json({ error: 'unavailable', reason: result.reason });
    }
    console.error('tree generation failed', result.reason);
    return res.status(503).json({ error: 'Could not draw a family tree yet' });
  }

  await kvTreeStore.putReady(key, result.data);
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(stripEvidence(result.data));
}
