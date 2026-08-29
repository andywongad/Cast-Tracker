import { buildRecapSource, type RecapEpisode, type RecapSource } from '../../src/lib/recap/window.js';

/**
 * Source text for a recap, from TMDb's season payload.
 *
 * One request covers the whole window: TMDb embeds every episode's number, title and overview in
 * `/tv/{id}/season/{n}`, so recapping thirteen episodes costs one call rather than thirteen. This
 * is the same endpoint api/tmdb.ts already proxies for the browser — called directly here because
 * the function has the key and shouldn't round-trip through its own proxy.
 *
 * Isolated behind fetchRecapSource() for the reason api/_lib/source-wikipedia.ts gives: the source
 * can be improved later (TVmaze summaries are longer on some shows, and a Fandom episode page is
 * longer still) without the generation logic knowing.
 *
 * The spoiler window is applied in src/lib/recap/window.ts, not here. This file's only job is
 * getting the season and handing it over.
 */

const TMDB = 'https://api.themoviedb.org/3';

/** TMDb is fast. A slow response here eats the budget the model call still needs. */
const FETCH_TIMEOUT_MS = 8000;

export interface RecapSourceResult extends RecapSource {
  /** Recorded on the stored recap. Set from the fetch, never from the model. */
  url: string;
  /** The season's own blurb, kept so the handler can tell a thin season from a missing one. */
  seasonOverview: string;
}

interface TmdbEpisode {
  episode_number?: number;
  name?: string;
  overview?: string;
}

/**
 * Returns null for anything that isn't usable source text — a season TMDb doesn't have, an
 * upstream failure, or a season whose overviews say nothing. The caller distinguishes the last
 * case (worth caching as "unavailable") from the first two (worth retrying) by asking whether the
 * season came back at all, via `fetched`.
 */
export async function fetchRecapSource(input: {
  showTmdbId: number;
  season: number;
  throughEpisode: number;
}): Promise<{ fetched: boolean; source: RecapSourceResult | null }> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('TMDB_API_KEY is not set; recaps cannot be generated');
    return { fetched: false, source: null };
  }

  const qs = new URLSearchParams({ api_key: apiKey });
  let payload: { overview?: string; episodes?: TmdbEpisode[] };
  try {
    const res = await fetch(`${TMDB}/tv/${input.showTmdbId}/season/${input.season}?${qs.toString()}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return { fetched: false, source: null };
    payload = (await res.json()) as { overview?: string; episodes?: TmdbEpisode[] };
  } catch {
    // Timeout, DNS, malformed JSON — all the same to the caller: no source this time.
    return { fetched: false, source: null };
  }

  const episodes: RecapEpisode[] = (payload.episodes ?? [])
    .filter((e): e is TmdbEpisode & { episode_number: number } => typeof e.episode_number === 'number')
    .map((e) => ({ number: e.episode_number, name: e.name ?? '', overview: e.overview ?? '' }));

  const seasonOverview = payload.overview ?? '';
  const built = buildRecapSource({
    season: input.season,
    seasonOverview,
    episodes,
    throughEpisode: input.throughEpisode,
  });

  if (!built) return { fetched: true, source: null };

  return {
    fetched: true,
    source: {
      ...built,
      seasonOverview,
      url: `https://www.themoviedb.org/tv/${input.showTmdbId}/season/${input.season}`,
    },
  };
}
