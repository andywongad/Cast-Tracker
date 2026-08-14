import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * TMDb proxy. The browser calls this instead of api.themoviedb.org so the API key stays on the
 * server — a VITE_-prefixed key is inlined into the client bundle and can be lifted by anyone
 * who opens devtools.
 *
 * Paths are allowlisted rather than forwarded blindly. Without that this becomes an open relay:
 * anyone could point it at any TMDb endpoint and spend your quota, and TMDb would see the abuse
 * as coming from you.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
const TMDB = 'https://api.themoviedb.org/3';

/** Exactly the endpoints src/lib/tmdb.ts calls — nothing else gets through. */
const ALLOWED: RegExp[] = [
  /^\/search\/tv$/,
  /^\/tv\/\d+$/,
  /^\/tv\/\d+\/season\/\d+$/,
  // Per-season cast totals, for "new in S3" badges and first→last season ranges. One call per
  // season, only ever made for shows classified as ensembles — see src/lib/showShape.ts.
  /^\/tv\/\d+\/season\/\d+\/aggregate_credits$/,
  /^\/tv\/\d+\/season\/\d+\/episode\/\d+\/credits$/,
  /^\/tv\/\d+\/aggregate_credits$/,
  /^\/person\/\d+\/combined_credits$/,
  /^\/person\/\d+\/external_ids$/,
];

/** Query params we forward. Anything else is dropped so callers can't smuggle in their own api_key. */
const FORWARDED = new Set(['query', 'append_to_response', 'language', 'page']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!TMDB_API_KEY) {
    // Misconfiguration, not a client error — say so plainly in the logs.
    console.error('TMDB_API_KEY is not set; /api/tmdb cannot serve requests');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!ALLOWED.some((re) => re.test(path))) {
    return res.status(400).json({ error: 'Unsupported path' });
  }

  const qs = new URLSearchParams({ api_key: TMDB_API_KEY });
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path' || !FORWARDED.has(k)) continue;
    qs.set(k, Array.isArray(v) ? v[0] : String(v));
  }

  try {
    const upstream = await fetch(`${TMDB}${path}?${qs.toString()}`);
    const body = await upstream.text();

    if (!upstream.ok) {
      // Don't pass TMDb's error body through — it can echo the key back in some responses.
      return res.status(upstream.status).json({ error: 'TMDb request failed' });
    }

    // Show metadata barely changes; let the edge absorb repeat lookups so they don't cost quota.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);
  } catch (err) {
    console.error('TMDb proxy error', err);
    return res.status(502).json({ error: 'Upstream unavailable' });
  }
}
