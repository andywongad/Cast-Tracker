import type { ShowType } from '../types';

const API = 'https://api.themoviedb.org/3';

/**
 * Dev-only direct key. `npm run dev` runs Vite alone, which doesn't serve /api, so local work
 * would otherwise lose TMDb entirely. In a production build this reads `undefined` — provided
 * VITE_TMDB_API_KEY is NOT set on the host — and the branch below is dead.
 *
 * Use `vercel dev` instead of `npm run dev` if you want to exercise the proxy locally.
 */
function devKey(): string {
  if (!import.meta.env.DEV) return '';
  return (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim() || '';
}

/**
 * In production the key lives on the server, so the client can't know whether it's configured.
 * Assume it is: a misconfigured proxy degrades exactly like a missing key did before — requests
 * return null and the UI falls back to manual entry.
 */
export function hasTmdbKey(): boolean {
  return import.meta.env.DEV ? devKey().length > 0 : true;
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

async function get<T>(path: string, params: Record<string, string | number> = {}): Promise<T | null> {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const key = devKey();

  // Dev without a serverless runtime: go straight to TMDb with the local key.
  // Everywhere else: through /api/tmdb, which holds the key server-side.
  const url = key
    ? `${API}${path}?${new URLSearchParams({ api_key: key, ...flat }).toString()}`
    : `/api/tmdb?${new URLSearchParams({ path, ...flat }).toString()}`;

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
  if (ids.includes(10764)) return 'REALITY';
  if (ids.includes(10767) || ids.includes(10763)) return 'VARIETY';
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
}

export async function getShowDetails(tmdbId: number): Promise<ShowDetails | null> {
  const data = await get<any>(`/tv/${tmdbId}`, { append_to_response: 'external_ids' });
  if (!data) return null;
  const seasons: number[] = (data.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => s.season_number);
  const imdbId = data.external_ids?.imdb_id || null;
  const wikiGuess = data.name ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(data.name).replace(/ /g, '_'))}` : null;
  return { seasons, imdbId, wikiGuess };
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
