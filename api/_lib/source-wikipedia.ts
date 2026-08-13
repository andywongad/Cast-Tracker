/**
 * Source text for enrichment, from Wikipedia.
 *
 * Isolated behind fetchSourceText() so the source can be improved or replaced without touching the
 * generation logic — a Fandom scrape, TVmaze summaries, or a mix, all fit the same signature. This
 * first implementation is deliberately simple: search, fetch the plain-text extract, and cut out
 * the window around the character's name.
 *
 * Quality varies enormously by show. A prestige drama has a "List of X characters" page with a
 * paragraph each; a mid-tier reality show has nothing. Returning null is the normal outcome for a
 * large share of cast members, not an error.
 */

const API = 'https://en.wikipedia.org/w/api.php';

/** Wikipedia's API policy asks for a descriptive UA that identifies the caller. */
const USER_AGENT = 'CastTracker/1.0 (https://cast-tracker-m8g3.vercel.app)';

/** Wikipedia is fast; a slow response here eats budget the model call still needs. */
const FETCH_TIMEOUT_MS = 8000;

/** Enough context for a few sentences of bio, bounded so a huge article can't run up token cost. */
const MAX_SOURCE_CHARS = 6000;
/** How much text around the first mention of the character to keep. */
const WINDOW_BEFORE = 400;
const WINDOW_AFTER = 2600;

export interface SourceText {
  text: string;
  url: string;
}

interface SearchHit {
  title: string;
}

async function callApi(params: Record<string, string>): Promise<unknown | null> {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  try {
    const res = await fetch(`${API}?${qs.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Timeout, DNS, malformed JSON — all the same to the caller: no source this time.
    return null;
  }
}

/**
 * Prefer a page about the character over the show's own page: a dedicated character page or a
 * "List of … characters" page carries per-character detail, while the show article rarely does.
 */
function pickBestTitle(hits: SearchHit[], characterName: string): string | null {
  if (!hits.length) return null;
  const wanted = characterName.toLowerCase();

  const named = hits.find((h) => h.title.toLowerCase().includes(wanted));
  if (named) return named.title;

  const list = hits.find((h) => /list of .* characters/i.test(h.title));
  if (list) return list.title;

  return hits[0].title;
}

/**
 * Cut the window around the character's first mention. On a "List of … characters" page the full
 * extract is mostly about other people — sending all of it wastes tokens and invites the model to
 * describe the wrong character.
 */
function extractRelevant(fullText: string, characterName: string): string | null {
  const haystack = fullText.toLowerCase();
  const needle = characterName.toLowerCase();

  let at = haystack.indexOf(needle);
  if (at === -1) {
    // Try the surname alone — pages often introduce a character by full name once, then by surname.
    const parts = characterName.trim().split(/\s+/);
    const surname = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    if (surname.length > 2) at = haystack.indexOf(surname);
  }
  if (at === -1) return null;

  const start = Math.max(0, at - WINDOW_BEFORE);
  return fullText.slice(start, start + WINDOW_BEFORE + WINDOW_AFTER).trim() || null;
}

export async function fetchSourceText(
  showTitle: string,
  characterName: string,
): Promise<SourceText | null> {
  if (!showTitle.trim() || !characterName.trim()) return null;

  const search = (await callApi({
    action: 'query',
    list: 'search',
    srsearch: `${characterName} ${showTitle}`,
    srlimit: '5',
  })) as { query?: { search?: SearchHit[] } } | null;

  const title = pickBestTitle(search?.query?.search ?? [], characterName);
  if (!title) return null;

  const page = (await callApi({
    action: 'query',
    prop: 'extracts',
    explaintext: '1',
    exsectionformat: 'plain',
    titles: title,
  })) as { query?: { pages?: Array<{ title?: string; extract?: string }> } } | null;

  const extract = page?.query?.pages?.[0]?.extract;
  if (!extract) return null;

  const relevant = extractRelevant(extract, characterName);
  if (!relevant) return null;

  return {
    text: relevant.slice(0, MAX_SOURCE_CHARS),
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
  };
}
