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
 * Requests currently in flight, by URL.
 *
 * Two callers asking for the same thing at the same moment is normal here, not exceptional:
 * StrictMode double-invokes every effect in development, and tapping along the episode rail fires
 * a fetch per tap while the previous one is still open. Sharing the promise means the second
 * caller waits on the first instead of opening a second request for the same bytes. Entries are
 * removed on settle, so this never acts as a response cache — a later call still goes to the
 * network, and the edge decides whether that costs anything.
 */
const inFlight = new Map<string, Promise<unknown>>();

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

  const pending = inFlight.get(url);
  if (pending) return pending as Promise<T | null>;

  const request = (async (): Promise<T | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  })();

  inFlight.set(url, request);
  // Always clears, including on the failure paths above, so one bad response can't wedge the URL.
  request.finally(() => { if (inFlight.get(url) === request) inFlight.delete(url); });
  return request;
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
  /**
   * TMDb's production status: 'Ended', 'Canceled', 'Returning Series', 'In Production', 'Planned'.
   * Only the first two mean there is a final episode to have reached — a returning show has no
   * end to be at, however far through it you are.
   */
  status: string;
  /**
   * `air_date` of the next episode TMDb has scheduled, or null when nothing is on the books.
   *
   * The pair of this and `status` is what decides whether a show can still surprise you. Neither
   * answers it alone: a returning series between seasons has no scheduled episode and is very much
   * still running, while a show TMDb calls 'Ended' occasionally has a special dated in the future.
   */
  nextEpisodeAt: string | null;
}

export async function getShowDetails(tmdbId: number): Promise<ShowDetails | null> {
  const data = await get<any>(`/tv/${tmdbId}`, { append_to_response: 'external_ids' });
  if (!data) return null;
  const seasons: number[] = (data.seasons || []).filter((s: any) => s.season_number > 0).map((s: any) => s.season_number);
  const imdbId = data.external_ids?.imdb_id || null;
  const wikiGuess = data.name ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(data.name).replace(/ /g, '_'))}` : null;
  return {
    seasons,
    imdbId,
    wikiGuess,
    totalEpisodes: data.number_of_episodes || 0,
    status: data.status || '',
    nextEpisodeAt: data.next_episode_to_air?.air_date || null,
  };
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

/**
 * Every actor credited anywhere in one season — regulars and guests alike.
 *
 * Ids only. The caller folds these into "which season does each actor first appear in", which is
 * the one thing the series-level aggregate_credits can't answer: it has episode counts but no
 * season identity at all.
 */
export async function getSeasonCastIds(tmdbId: number, season: number): Promise<number[] | null> {
  const data = await get<{ cast: { id: number }[] }>(`/tv/${tmdbId}/season/${season}/aggregate_credits`);
  if (!data) return null;
  return (data.cast || []).map((p) => p.id).filter((id) => typeof id === 'number');
}

export interface SeasonEpisode {
  number: number;
  name: string;
  /** What happened. Rides along on the season payload; the mapper used to discard it. */
  overview: string;
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
export interface Season {
  /**
   * What the season is about, as a whole. A separate field from the episode overviews and often
   * far better written — on shows whose per-episode text is a teaser rather than a synopsis, this
   * is the only real summary TMDb has. Empty on plenty of seasons, so every reader needs a
   * fallback.
   */
  overview: string;
  episodes: SeasonEpisode[];
}

/** The season payload in full. Same request as `getSeasonEpisodes`, and deduped with it. */
export async function getSeason(tmdbId: number, season: number): Promise<Season> {
  const data = await get<{ overview?: string; episodes: any[] }>(`/tv/${tmdbId}/season/${season}`);
  if (!data) return { overview: '', episodes: [] };
  return {
    overview: data.overview || '',
    episodes: (data.episodes || []).map((e) => ({
    number: e.episode_number,
    name: e.name || '',
    overview: e.overview || '',
    guests: (e.guest_stars || []).map((p: any) => ({
      id: p.id,
      name: p.name,
      character: p.character || p.roles?.[0]?.character || '',
      photo: img(p.profile_path, 'w185'),
      })),
    })),
  };
}

export async function getSeasonEpisodes(tmdbId: number, season: number): Promise<SeasonEpisode[]> {
  return (await getSeason(tmdbId, season)).episodes;
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

/**
 * Where a show can be watched, for one country.
 *
 * TMDb sources this from JustWatch, whose terms require the attribution the card renders — that
 * line is not decoration and should not be dropped. `link` opens the full, always-current list;
 * what comes back here is a snapshot and the set of services carrying a show changes constantly.
 */
export interface WatchProvider {
  name: string;
  logo: string | null;
}

export interface WatchOptions {
  /** Included with a subscription, which is what "where can I watch this" usually means. */
  stream: WatchProvider[];
  /** Free or ad-supported. Worth showing beside a subscription, not below a purchase. */
  free: WatchProvider[];
  /** True when the only way to watch is to pay per episode or season. */
  buyOnly: boolean;
  /** TMDb's JustWatch page for this show and country. */
  link: string | null;
  region: string;
}

/**
 * The country to ask about, from the browser rather than from a setting nobody would find.
 *
 * Availability is per country and the answer for the wrong one is worse than useless — it names
 * services the person cannot subscribe to. `US` is the fallback because it is the region TMDb's
 * data is densest for, not because it is a good guess for any particular visitor.
 */
export function watchRegion(): string {
  try {
    const locale = new Intl.Locale(navigator.language);
    const region = locale.region || (navigator.language.split('-')[1] ?? '');
    return /^[A-Z]{2}$/.test(region.toUpperCase()) ? region.toUpperCase() : 'US';
  } catch {
    return 'US';
  }
}

const provider = (p: { provider_name?: string; logo_path?: string | null }): WatchProvider => ({
  name: p.provider_name || 'Unknown',
  // w45 is the size these are drawn at. See the note on cast photos: payload weight beats
  // sharpness nobody is looking closely enough to notice.
  logo: p.logo_path ? `https://image.tmdb.org/t/p/w45${p.logo_path}` : null,
});

/**
 * The ad-supported tier of a service someone already thinks of as one thing.
 *
 * Reacher comes back as "Amazon Prime Video", "Amazon Prime Video with Ads" and "Amazon Prime
 * Video Free with Ads" — three providers with three ids, across two categories, which render as
 * three chips saying the same brand. Nobody reading the card is choosing between them.
 *
 * Only the tier suffix is stripped, and only to compare. "Paramount+ Amazon Channel" and
 * "Paramount+" are deliberately left as two: that one really is a different subscription, and
 * collapsing it would tell someone they have a service they do not.
 */
const AD_TIER = /\s+(free\s+)?(with ads|basic with ads|standard with ads)$/i;

export async function getWatchProviders(tmdbId: number, region = watchRegion()): Promise<WatchOptions | null> {
  const data = await get<{ results?: Record<string, any> }>(`/tv/${tmdbId}/watch/providers`);
  const forRegion = data?.results?.[region];
  if (!forRegion) return null;

  /**
   * One entry per service, first listing wins. `flatrate` is read before the free and ad-supported
   * lists, so the plain name is the one kept and the tier variants drop out behind it — and a
   * service that only appears as an ad tier keeps its full name, because there "with Ads" is the
   * useful part rather than noise.
   */
  const seen = new Set<string>();
  const take = (list: unknown[] | undefined): WatchProvider[] =>
    (list || []).map((p) => provider(p as { provider_name?: string; logo_path?: string | null })).filter((p) => {
      const key = p.name.replace(AD_TIER, '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    stream: take(forRegion.flatrate),
    free: take([...(forRegion.free || []), ...(forRegion.ads || [])]),
    buyOnly:
      !(forRegion.flatrate || []).length &&
      !(forRegion.free || []).length &&
      !(forRegion.ads || []).length &&
      !!((forRegion.buy || []).length || (forRegion.rent || []).length),
    link: forRegion.link || null,
    region,
  };
}
