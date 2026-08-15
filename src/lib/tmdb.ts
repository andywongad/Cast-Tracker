import type { ShowType } from '../types';

/**
 * Whether TMDb-backed features should be offered at all.
 *
 * Always true now: the key lives on the server in production, and locally vite.config.ts proxies
 * /api to a deployed origin, so dev has the same routes. The client can't see server config
 * either way, and a misconfigured proxy degrades exactly like a missing key always did — requests
 * return null and the UI falls back to manual entry.
 *
 * This previously required a local VITE_TMDB_API_KEY in dev, which silently disabled show search
 * for anyone developing without a key on their machine — the case the proxy was added to remove.
 */
export function hasTmdbKey(): boolean {
  return true;
}

export function img(path: string | null | undefined, size: string = 'w300'): string | null {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export interface TmdbShowResult {
  id: number;
  name: string;
  first_air_date?: string;
  poster_path: string | null;
  genre_ids: number[];
  origin_country?: string[];
}

/**
 * Always through /api/tmdb, which holds the key server-side. Locally, vite.config.ts proxies
 * /api to a deployed origin, so dev and production take the identical path.
 *
 * There used to be a dev branch that called TMDb directly when VITE_TMDB_API_KEY was present.
 * It silently outranked the proxy, so a stale key left in .env — a rotated one, returning 401 —
 * made search fail with no error anywhere. One path is worth more than offline convenience.
 */
async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `/api/tmdb?${new URLSearchParams({ path, ...flat }).toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function inferShowType(genreIds: number[] | undefined): ShowType {
  const ids = genreIds || [];
  // TMDb has no "variety" genre. 10764 Reality, 10767 Talk and 10763 News are the only
  // unscripted ones, and Korean variety shows come back as Reality — Running Man and Knowing Bros
  // are both [Comedy, Reality]. Talk and news land here too: they have a rotating cast of real
  // people, which is what this flag actually decides.
  if (ids.includes(10764) || ids.includes(10767) || ids.includes(10763)) return 'REALITY';
  return 'DRAMA';
}

export async function searchShows(query: string): Promise<TmdbShowResult[]> {
  if (!query.trim()) return [];
  const data = await get<{ results: TmdbShowResult[] }>('/search/tv', { query });
  return (data?.results || []).slice(0, 6);
}

export interface ShowDetails {
  seasons: number[];
  imdbId: string | null;
  wikiGuess: string | null;
  /** Series-wide episode total — the denominator for show classification. */
  totalEpisodes: number;
}

export async function getShowDetails(tmdbId: number): Promise<ShowDetails | null> {
  const data = await get<any>(`/tv/${tmdbId}`, { append_to_response: 'external_ids' });
  if (!data) return null;
  const seasons: number[] = (data.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => s.season_number);
  const imdbId = data.external_ids?.imdb_id || null;
  const wikiGuess = data.name ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(data.name).replace(/ /g, '_'))}` : null;
  return { seasons, imdbId, wikiGuess, totalEpisodes: data.number_of_episodes || 0 };
}

export async function getSeasonEpisodeCount(tmdbId: number, season: number): Promise<number | null> {
  const data = await get<{ episodes: any[] }>(`/tv/${tmdbId}/season/${season}`);
  if (!data) return null;
  return (data.episodes || []).length;
}

export interface EpisodeCastMember {
  id: number;
  name: string;
  character: string;
  photo: string | null;
}

export async function getEpisodeCredits(tmdbId: number, season: number, episode: number): Promise<EpisodeCastMember[]> {
  const data = await get<{ cast: any[]; guest_stars: any[] }>(`/tv/${tmdbId}/season/${season}/episode/${episode}/credits`);
  if (!data) return [];
  return [...(data.cast || []), ...(data.guest_stars || [])].map((p) => ({
    id: p.id,
    name: p.name,
    character: p.character || p.roles?.[0]?.character || '',
    photo: img(p.profile_path, 'w185'),
  }));
}

export interface AggregateCastMember {
  id: number;
  name: string;
  character: string;
  characters: string[];
  photo: string | null;
  /**
   * Episodes this person appears in across the whole series. The field TMDb returns and this
   * mapper used to discard — it's what show classification and the per-character counts are
   * built from. 0 when TMDb omits it.
   */
  episodeCount: number;
}

export async function getAggregateCredits(tmdbId: number): Promise<AggregateCastMember[]> {
  const data = await get<{ cast: any[] }>(`/tv/${tmdbId}/aggregate_credits`);
  if (!data) return [];
  return (data.cast || []).map((p) => ({
    id: p.id,
    name: p.name,
    character: p.roles?.[0]?.character || '',
    characters: (p.roles || []).map((r: any) => r.character).filter(Boolean),
    photo: img(p.profile_path, 'w185'),
    episodeCount: p.total_episode_count || 0,
  }));
}

export interface SeasonEpisode {
  number: number;
  name: string;
  /** Guest stars credited on this episode. Comes free with the season payload. */
  guests: EpisodeCastMember[];
}

/**
 * Every episode in a season — number, title, and guest stars — from a single call.
 *
 * The season payload embeds `guest_stars` on each episode, verified identical to what the
 * per-episode credits endpoint returns (23 of 23 matching ids on The Sopranos S1E2). So an
 * episode rail with titles, and the guest tier for any episode in the season, both come from one
 * request rather than one per episode. A 24-episode season is 1 call, not 24.
 */
export async function getSeasonEpisodes(tmdbId: number, season: number): Promise<SeasonEpisode[]> {
  const data = await get<{ episodes: any[] }>(`/tv/${tmdbId}/season/${season}`);
  if (!data) return [];
  return (data.episodes || []).map((e) => ({
    number: e.episode_number,
    name: e.name || '',
    guests: (e.guest_stars || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      character: p.character || p.roles?.[0]?.character || '',
      photo: img(p.profile_path, 'w185'),
    })),
  }));
}

export interface PersonCredit {
  title: string;
  year: string | null;
}

export async function getPersonCredits(personId: number): Promise<PersonCredit[]> {
  const data = await get<{ cast: any[] }>(`/person/${personId}/combined_credits`);
  if (!data) return [];
  return (data.cast || [])
    .map((c) => ({
      title: c.name || c.title || '',
      year: (c.first_air_date || c.release_date || '').slice(0, 4) || null,
      popularity: c.popularity || 0,
    }))
    .filter((c) => c.title)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, 16)
    .sort((a, b) => (parseInt(a.year || '9999') - parseInt(b.year || '9999')))
    .map((c) => ({ title: c.title, year: c.year }));
}

export async function getPersonWikiImdb(personId: number): Promise<{ imdbUrl: string | null } | null> {
  const data = await get<any>(`/person/${personId}/external_ids`);
  if (!data) return null;
  return { imdbUrl: data.imdb_id ? `https://www.imdb.com/name/${data.imdb_id}/` : null };
}
