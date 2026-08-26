/**
 * TMDb show id -> TVmaze show, and the fetch helper both callers need.
 *
 * Extracted from api/tvmaze.ts when the episode cron needed the same chain to find air times.
 * Two copies of this would drift on the part that is easy to get wrong — the name-search fallback
 * and the guard on it — and the failure mode of a wrong guard is silent: notifications about the
 * wrong show, or a remake's schedule attached to the original.
 *
 * The chain, which exists because TVmaze has no TMDb lookup:
 *   TMDb /tv/{id}?append_to_response=external_ids  ->  tvdb_id / imdb_id
 *   TVmaze /lookup/shows?thetvdb={id}   (falls back to ?imdb={id}, then to a verified name search)
 *
 * Rate limit is ~20 calls / 10s per IP. Callers that run over many shows should cache the result.
 */

export const TVMAZE = 'https://api.tvmaze.com';
const TMDB = 'https://api.themoviedb.org/3';

export async function json<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
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

export interface Resolved {
  /** The TVmaze show, or null. */
  show: any | null;
  /** The TMDb payload that was fetched on the way, so callers don't fetch it twice. */
  tmdb: any | null;
  /** Why there is no show, for the caller's own logging and cache decisions. */
  reason: string | null;
}

export async function resolveTvmazeShow(tmdbId: number, tmdbKey: string): Promise<Resolved> {
  const ext = await json<any>(
    `${TMDB}/tv/${tmdbId}?${new URLSearchParams({ api_key: tmdbKey, append_to_response: 'external_ids' })}`,
  );
  if (!ext) return { show: null, tmdb: null, reason: 'tmdb-lookup-failed' };

  const tvdbId = ext.external_ids?.tvdb_id ?? null;
  const imdbId = ext.external_ids?.imdb_id ?? null;

  let show = tvdbId ? await json<any>(`${TVMAZE}/lookup/shows?thetvdb=${encodeURIComponent(String(tvdbId))}`) : null;
  if (!show && imdbId) show = await json<any>(`${TVMAZE}/lookup/shows?imdb=${encodeURIComponent(String(imdbId))}`);

  // The id chain alone isn't enough. TVmaze only resolves /lookup when it has recorded that
  // external id, and newer or international titles often have `externals: {thetvdb: null,
  // imdb: null}` while still being fully present. Fall back to name search, but verify the hit —
  // an unvalidated title match will happily return the wrong show.
  if (!show?.id) {
    const candidate = await json<any>(`${TVMAZE}/singlesearch/shows?q=${encodeURIComponent(ext.name || '')}`);
    if (candidate?.id && isPlausible(candidate, ext)) show = candidate;
    else if (candidate?.id) console.info('[tvmaze] rejected name match', candidate.name, 'for', ext.name);
  }

  if (!show?.id) return { show: null, tmdb: ext, reason: 'no-tvmaze-match' };
  return { show, tmdb: ext, reason: null };
}
