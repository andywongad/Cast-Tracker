import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, resolveTvmazeShow, TVMAZE } from './_lib/tvmaze-id.js';

/**
 * TVmaze cast lookup, keyed by TMDb show id.
 *
 * TVmaze models characters as first-class entities with their own images, which TMDb's image
 * policy forbids — that's the whole reason this exists. It needs no API key, but lives server-side
 * anyway so the browser makes exactly one same-origin request, the edge absorbs repeats, and no
 * upstream host details leak into the bundle.
 *
 * The TMDb -> TVmaze id chain lives in _lib/tvmaze-id.ts, shared with the episode cron, which
 * needs the same resolution to find air times. One copy, because the fallback's guard is the part
 * that is easy to get subtly wrong and its failure mode is silent.
 *
 * The whole chain is three upstream calls, once per show. Callers persist the returned tvmazeId
 * so it never runs twice. Rate limit is ~20 calls / 10s per IP, which this stays far inside.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;

interface CastEntry {
  character: string;
  characterImage: string | null;
  actor: string;
  tvmazeCharacterId: number | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = typeof req.query.tmdbId === 'string' ? req.query.tmdbId : '';
  const tmdbId = Number(raw);
  if (!raw || !Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: 'tmdbId must be a positive integer' });
  }
  if (!TMDB_API_KEY) {
    console.error('TMDB_API_KEY is not set; /api/tvmaze cannot resolve external ids');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }

  // A miss is a normal outcome, not an error — plenty of shows aren't in TVmaze. Cache those
  // just as hard as hits, or every page view retries a lookup that will never succeed.
  const miss = (reason: string) => {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ tvmazeId: null, reason, cast: [] });
  };

  const { show, reason } = await resolveTvmazeShow(tmdbId, TMDB_API_KEY);
  if (!show?.id) return miss(reason || 'no-tvmaze-match');

  // One call returns the entire cast. Never fetch per character.
  const cast = await json<any[]>(`${TVMAZE}/shows/${show.id}/cast`);
  if (!Array.isArray(cast)) return miss('cast-fetch-failed');

  const entries: CastEntry[] = cast.map((c) => {
    const ch = c.character || {};
    const pe = c.person || {};
    return {
      character: ch.name || '',
      // original is a larger asset than medium and these are shown at card size or bigger.
      characterImage: ch.image?.original || ch.image?.medium || null,
      actor: pe.name || '',
      tvmazeCharacterId: ch.id ?? null,
    };
  });

  // Image URLs are immutable on TVmaze — a new primary image gets a new URL rather than
  // replacing the bytes — so this can cache hard.
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({
    tvmazeId: show.id,
    showUrl: show.url || null,
    withCharacterImage: entries.filter((e) => e.characterImage).length,
    cast: entries,
  });
}
