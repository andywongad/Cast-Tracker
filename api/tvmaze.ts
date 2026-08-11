import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * TVmaze cast lookup, keyed by TMDb show id.
 *
 * TVmaze models characters as first-class entities with their own images, which TMDb's image
 * policy forbids — that's the whole reason this exists. It needs no API key, but lives server-side
 * anyway so the browser makes exactly one same-origin request, the edge absorbs repeats, and no
 * upstream host details leak into the bundle.
 *
 * TVmaze has no TMDb lookup, so the id chain is:
 *   TMDb /tv/{id}?append_to_response=external_ids  ->  tvdb_id / imdb_id
 *   TVmaze /lookup/shows?thetvdb={id}   (falls back to ?imdb={id})
 *
 * The whole chain is three upstream calls, once per show. Callers persist the returned tvmazeId
 * so it never runs twice. Rate limit is ~20 calls / 10s per IP, which this stays far inside.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY;
const TMDB = 'https://api.themoviedb.org/3';
const TVMAZE = 'https://api.tvmaze.com';

interface CastEntry {
  character: string;
  characterImage: string | null;
  actor: string;
  tvmazeCharacterId: number | null;
}

const norm = (s: string | null | undefined) =>
  (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/**
 * Guard for the name-search fallback. Requires the title to match after normalisation AND the
 * premiere year to be within a year of TMDb's, so a common-word title can't pull in a remake or
 * an unrelated show with the same name.
 */
function isPlausible(candidate: any, tmdb: any): boolean {
  const names = [tmdb.name, tmdb.original_name].filter(Boolean).map(norm);
  if (!names.includes(norm(candidate.name))) return false;

  const a = Number(String(tmdb.first_air_date || '').slice(0, 4));
  const b = Number(String(candidate.premiered || '').slice(0, 4));
  if (a && b && Math.abs(a - b) > 1) return false;

  return true;
}

async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
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

  const ext = await json<any>(
    `${TMDB}/tv/${tmdbId}?${new URLSearchParams({ api_key: TMDB_API_KEY, append_to_response: 'external_ids' })}`,
  );
  if (!ext) return miss('tmdb-lookup-failed');

  const tvdbId = ext.external_ids?.tvdb_id ?? null;
  const imdbId = ext.external_ids?.imdb_id ?? null;

  let show = tvdbId ? await json<any>(`${TVMAZE}/lookup/shows?thetvdb=${encodeURIComponent(String(tvdbId))}`) : null;
  if (!show && imdbId) show = await json<any>(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(String(imdbId))}`);

  // The id chain alone isn't enough. TVmaze only resolves /lookup when it has recorded that
  // external id, and newer or international titles often have `externals: {thetvdb: null,
  // imdb: null}` while still being fully present with cast and images. Fall back to name search,
  // but verify the hit — an unvalidated title match will happily return the wrong show.
  if (!show?.id) {
    const candidate = await json<any>(`${TVMAZE}/singlesearch/shows?q=${encodeURIComponent(ext.name || '')}`);
    if (candidate?.id && isPlausible(candidate, ext)) show = candidate;
    else if (candidate?.id) console.info('[tvmaze] rejected name match', candidate.name, 'for', ext.name);
  }

  if (!show?.id) return miss('no-tvmaze-match');

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
