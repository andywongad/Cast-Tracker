import type { VercelRequest, VercelResponse } from '@vercel/node';
import { enrichmentKey } from './_lib/key';
import { fetchSourceText } from './_lib/source-wikipedia';
import { generateEnrichment } from './_lib/generate';
import {
  kvEnrichmentStore,
  underGenerationLimit,
  NO_SOURCE_TTL_SECONDS,
  REFUSAL_TTL_SECONDS,
} from './_lib/store-kv';

/**
 * Check-then-generate endpoint for character enrichment.
 *
 * GET /api/enrichment?showId=1398&showTitle=The%20Sopranos&characterName=Tony%20Soprano&actorId=31838
 *
 * Query params rather than a path like /api/enrichment/:showId/:characterId, to match the shape
 * api/tmdb.ts already established — and because the identifier here is a composite, not a single
 * id (see api/_lib/key.ts for why there is no stable character id to put in a path).
 *
 * Called once per character, when the user opens that character. Never on grid render and never
 * during bulk cast import — a show page shows 40 cards, and generating for all of them would spend
 * 40 model calls on characters nobody opened.
 *
 * Follows api/tmdb.ts: allowlist the inputs, keep the key server-side, never pass an upstream error
 * body back to the client.
 */

/** Generations per IP per day. Cache hits don't count — only calls that reach the model. */
const MAX_GENERATIONS_PER_DAY = 60;

const MAX_TITLE_LENGTH = 200;
const MAX_NAME_LENGTH = 120;

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
  const characterName = firstParam(req.query.characterName).trim().slice(0, MAX_NAME_LENGTH);
  const actorIdRaw = firstParam(req.query.actorId);
  const actorTmdbId = actorIdRaw ? Number.parseInt(actorIdRaw, 10) : null;

  if (!Number.isInteger(showId) || showId <= 0 || !showTitle || !characterName) {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }

  const key = enrichmentKey({
    showTmdbId: showId,
    actorTmdbId: Number.isInteger(actorTmdbId as number) ? actorTmdbId : null,
    characterName,
  });
  if (!key) {
    return res.status(400).json({ error: 'Could not identify character' });
  }

  // ---- Cached? -------------------------------------------------------------
  const cached = await kvEnrichmentStore.get(key);
  if (cached?.status === 'ready') {
    // Immutable once generated, so let the edge serve repeats without waking a function.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(cached.data);
  }
  if (cached?.status === 'unavailable') {
    // A known dead end. Answering from the marker skips a pointless Wikipedia round trip.
    return res.status(404).json({ error: 'unavailable', reason: cached.reason });
  }

  // ---- Generate ------------------------------------------------------------
  if (!(await underGenerationLimit(clientIp(req), MAX_GENERATIONS_PER_DAY))) {
    return res.status(429).json({ error: 'Too many requests today' });
  }

  const source = await fetchSourceText(showTitle, characterName);
  if (!source) {
    // Expected for a large share of cast members — many characters simply aren't written about.
    await kvEnrichmentStore.putUnavailable(key, 'no_source', NO_SOURCE_TTL_SECONDS);
    return res.status(404).json({ error: 'unavailable', reason: 'no_source' });
  }

  const result = await generateEnrichment({ showTitle, characterName, source });

  if (!result.ok) {
    // Only permanent outcomes are cached. Caching a rate limit or a socket hangup would freeze a
    // few minutes of trouble into a lasting "no" for every future viewer of this character.
    if (result.permanent) {
      await kvEnrichmentStore.putUnavailable(key, result.reason, REFUSAL_TTL_SECONDS);
      return res.status(404).json({ error: 'unavailable', reason: result.reason });
    }
    console.error('enrichment generation failed', result.reason);
    return res.status(503).json({ error: 'Could not generate yet' });
  }

  await kvEnrichmentStore.putReady(key, result.data);
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json(result.data);
}
