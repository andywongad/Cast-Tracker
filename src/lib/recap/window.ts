/**
 * Which episodes a recap is allowed to see, and how they become source text.
 *
 * THIS FILE IS THE SPOILER BOUNDARY. Everything else in the recap feature is plumbing; this is the
 * part that decides what the model is shown, and a bug here spoils the show for the person who
 * opened the app trusting it not to. It is pure and I/O-free so it can be tested directly, and it
 * is tested in src/lib/recap.test.ts.
 *
 * The rule is two lines. Episodes numbered `throughEpisode` or lower, in the season named, and
 * nothing else — plus the season's own blurb only once the season is finished, because that blurb
 * summarises the whole season and is a spoiler at every point before its last episode. `throughEpisode` is inclusive because of what the caller means by it — RecapSheet
 * carries "the episode this recap is *about*", which is the one already watched, not the one about
 * to be. See the header of src/hooks/useUI.tsx.
 *
 * Deliberately not an LLM's job. Asking a model to "only use episodes up to N" is a request it can
 * decline or lose track of halfway down a long list; filtering the array before it is sent is a
 * constraint it cannot violate. The prompt repeats the rule anyway, as a second lock — but this is
 * the one that holds.
 */

/**
 * Total source budget. A 24-episode procedural at full length would be far more text than the
 * recap needs and more than it should cost.
 */
const MAX_SOURCE_CHARS = 12_000;

/** Per-episode cap, so one unusually verbose entry can't crowd out the rest of the season. */
const MAX_EPISODE_CHARS = 1200;

/**
 * Below this there is nothing to recap.
 *
 * The Bear is the case that set it: episode overviews with a median of 19 characters
 * ("Opportunity.", "Gears start to turn."). No model can recap text that says nothing, and asking
 * one to try produces confident invention. Answering "unavailable" instead lets RecapSheet fall
 * back to the TMDb text it already renders, which is the honest floor.
 */
const MIN_SOURCE_CHARS = 400;

export interface RecapEpisode {
  number: number;
  name: string;
  overview: string;
}

export interface RecapSource {
  text: string;
  /** How many episodes actually contributed text. Reported to the reader, so it must be true. */
  episodesCovered: number;
}

/**
 * The last episode number in a season, for callers holding "whatever the final one was".
 *
 * Resolved before the request rather than inside it: the cache key has to be canonical, and a
 * request keyed on episode 0 would cache the same recap a second time under a second name.
 */
export function lastEpisodeNumber(episodes: RecapEpisode[]): number {
  return episodes.reduce((max, e) => (e.number > max ? e.number : max), 0);
}

/**
 * Every episode at or before the boundary, in order.
 *
 * Sorts rather than trusting the input: TMDb returns episodes in order today, and a recap that
 * silently depends on that would break quietly rather than loudly on the day it doesn't.
 */
export function episodesThrough(episodes: RecapEpisode[], throughEpisode: number): RecapEpisode[] {
  return episodes
    .filter((e) => Number.isInteger(e.number) && e.number >= 1 && e.number <= throughEpisode)
    .sort((a, b) => a.number - b.number);
}

/**
 * Turn the allowed episodes into the text the model is given.
 *
 * Returns null when there isn't enough to work with — the caller treats that as "unavailable",
 * which is cached, so a thin season is looked at once rather than on every open.
 *
 * When the budget is tight the *earliest* episodes are dropped, not the latest. A "previously on"
 * weights what just happened; losing episode 2 of a long season costs less than losing the episode
 * immediately before the one about to be played.
 */
export function buildRecapSource(input: {
  season: number;
  seasonOverview: string;
  episodes: RecapEpisode[];
  throughEpisode: number;
}): RecapSource | null {
  const covered = episodesThrough(input.episodes, input.throughEpisode);
  if (covered.length === 0) return null;

  /**
   * The season blurb is only safe once the season is finished.
   *
   * It describes the season as a whole — including the episodes after the boundary — so mid-season
   * it is a spoiler wearing the costume of context. The Bear's fourth season is the case that
   * caught this: per-episode overviews with a median of 19 characters, next to a 385-character
   * season summary. Counting that summary as source made a season with nothing watchable-safe to
   * say look like a season with plenty, and what the model would have had to write from was a
   * description of episodes the reader hadn't reached.
   *
   * Finished is judged against the whole episode list, not the covered slice, so a season that is
   * still airing fails this test — TMDb lists announced episodes ahead of broadcast, and the
   * blurb for an airing season is written to sell the rest of it.
   */
  const seasonComplete = input.throughEpisode >= lastEpisodeNumber(input.episodes);
  const usableSeasonOverview = seasonComplete ? input.seasonOverview.trim() : '';

  const seasonBlock = usableSeasonOverview
    ? `Season ${input.season} overview: ${usableSeasonOverview}\n\n`
    : '';

  const blocks: string[] = [];
  let spent = seasonBlock.length;
  let episodesCovered = 0;

  // Walk backwards from the boundary so that what survives a tight budget is the recent end.
  for (let i = covered.length - 1; i >= 0; i--) {
    const ep = covered[i];
    // An episode with no overview is still listed. The title alone is weak evidence, but a gap in
    // the numbering would read to the model as an episode that didn't happen.
    const overview = ep.overview.trim().slice(0, MAX_EPISODE_CHARS);
    const title = ep.name.trim();
    const block = `Episode ${ep.number}${title ? ` — ${title}` : ''}\n${overview || '(no summary available)'}\n\n`;
    if (spent + block.length > MAX_SOURCE_CHARS && blocks.length > 0) break;

    blocks.unshift(block);
    spent += block.length;
    if (overview) episodesCovered++;
  }

  const text = `${seasonBlock}${blocks.join('')}`.trim();

  // Measured on the substance, not the scaffolding: episode numbers and titles are always present
  // and would let a season of empty overviews clear any length test built on the whole string.
  // Counts only the season blurb that actually went in, or a season held back as unsafe would
  // still be vouching for the episodes it was excluded from.
  const substance =
    usableSeasonOverview.length + covered.reduce((n, e) => n + e.overview.trim().length, 0);
  if (substance < MIN_SOURCE_CHARS) return null;

  return { text, episodesCovered };
}
