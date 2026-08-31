import { narrowToRelational } from '../../src/lib/familyTree/narrow.js';

/**
 * Source material for a family tree: who is in the episode, and what an article says about how
 * they are related.
 *
 * Two fetches, because the two halves answer different questions and only one of them is
 * trustworthy. TMDb answers "who does this episode credit" — a closed, factual list, and the thing
 * that makes the index lock in verify.ts possible at all. Wikipedia answers "how are these people
 * related", in prose, mixed in with eight seasons of everything else.
 *
 * The character list is deliberately taken from the *episode's* credits rather than the show's, so
 * a tree built from episode one cannot name someone who has not appeared. That is the strongest
 * guarantee in the whole feature and it costs one extra request.
 *
 * The narrowing that follows is in src/lib/familyTree/narrow.ts, not here — same division as
 * recap-source.ts, which fetches a season and lets window.ts decide what may be shown. This file's
 * only job is getting the two payloads and handing them over.
 */

const TMDB = 'https://api.themoviedb.org/3';
const WIKI = 'https://en.wikipedia.org/w/api.php';

/** Wikipedia's API policy asks for a descriptive UA that identifies the caller. */
const USER_AGENT = 'CastTracker/1.0 (https://cast-tracker-m8g3.vercel.app)';

/** Two sequential fetches share one function budget; neither may be slow. */
const FETCH_TIMEOUT_MS = 8000;

/**
 * A cast list longer than this is a crowd scene, not a family.
 *
 * Cutting it also protects the index lock's value: TMDb orders credits by billing, so the first
 * twenty-five are the people an episode is actually about, and everyone after them is a guard with
 * one line who would only add ways for the model to be wrong.
 */
const MAX_CAST = 25;

export interface TreeSourceResult {
  /** The characters, in TMDb's billing order. The indices in a generated tree point into this. */
  names: string[];
  /** The narrowed article text. The evidence check in verify.ts searches exactly this string. */
  text: string;
  url: string;
}

interface TmdbCredit {
  character?: string;
  name?: string;
}

/** TMDb sometimes writes a role as "Eddard 'Ned' Stark (voice)" or "Self - Host". Keep the person. */
function cleanCharacterName(raw: string): string {
  return raw
    .replace(/\((?:voice|uncredited|archive footage)[^)]*\)/gi, '')
    .split(/\s+[-–]\s+/)[0]
    .trim();
}

async function fetchEpisodeCast(
  showTmdbId: number,
  season: number,
  episode: number,
  apiKey: string,
): Promise<string[] | null> {
  const qs = new URLSearchParams({ api_key: apiKey });
  try {
    const res = await fetch(
      `${TMDB}/tv/${showTmdbId}/season/${season}/episode/${episode}/credits?${qs.toString()}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as { cast?: TmdbCredit[]; guest_stars?: TmdbCredit[] };

    // Guest stars after the regulars: a first episode introduces family members who are not yet
    // series regulars, and dropping them would leave holes in exactly the tree being asked for.
    const all = [...(payload.cast ?? []), ...(payload.guest_stars ?? [])];
    const seen = new Set<string>();
    const names: string[] = [];
    for (const c of all) {
      const name = cleanCharacterName(c.character ?? '');
      // No character name means a crew credit or a "Self" appearance; neither belongs in a tree.
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      names.push(name);
      if (names.length >= MAX_CAST) break;
    }
    return names;
  } catch {
    return null;
  }
}

async function wikiApi(params: Record<string, string>): Promise<unknown | null> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  try {
    const res = await fetch(`${WIKI}?${qs.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Prefer the show's character-list page.
 *
 * The inverse of pickBestTitle in source-wikipedia.ts, which wants one character and takes the list
 * page only as a fallback. A tree wants the page that describes everybody in relation to everybody,
 * and that is precisely the "List of … characters" article.
 */
function pickListTitle(hits: { title?: string }[], showTitle: string): string | null {
  const titles = hits.map((h) => h.title).filter((t): t is string => !!t);
  if (!titles.length) return null;

  const list = titles.find((t) => /list of .* characters/i.test(t));
  if (list) return list;

  const show = titles.find((t) => t.toLowerCase().includes(showTitle.toLowerCase()));
  return show ?? titles[0];
}

/**
 * Returns `fetched` so the caller can tell a show whose article says nothing about relationships —
 * a fact about the show, worth caching as unavailable — from an upstream that did not answer,
 * which is a fact about this minute and must not be frozen into a permanent no. Same contract as
 * fetchRecapSource.
 */
export async function fetchTreeSource(input: {
  showTmdbId: number;
  showTitle: string;
  season: number;
  asOfEpisode: number;
}): Promise<{ fetched: boolean; source: TreeSourceResult | null }> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('TMDB_API_KEY is not set; family trees cannot be generated');
    return { fetched: false, source: null };
  }

  const names = await fetchEpisodeCast(input.showTmdbId, input.season, input.asOfEpisode, apiKey);
  if (!names) return { fetched: false, source: null };
  // One person cannot be related to anyone. Nothing failed; there is simply no tree here.
  if (names.length < 2) return { fetched: true, source: null };

  const search = (await wikiApi({
    action: 'query',
    list: 'search',
    srsearch: `List of ${input.showTitle} characters`,
    srlimit: '5',
  })) as { query?: { search?: { title?: string }[] } } | null;

  if (!search) return { fetched: false, source: null };

  const title = pickListTitle(search.query?.search ?? [], input.showTitle);
  if (!title) return { fetched: true, source: null };

  const page = (await wikiApi({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'plain',
    titles: title,
  })) as { query?: { pages?: Array<{ extract?: string }> } } | null;

  if (!page) return { fetched: false, source: null };

  const extract = page.query?.pages?.[0]?.extract ?? '';
  const text = narrowToRelational(extract, names);
  // An article with no sentence naming two of these people has nothing to build a tree from.
  if (!text) return { fetched: true, source: null };

  return {
    fetched: true,
    source: {
      names,
      text,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    },
  };
}
