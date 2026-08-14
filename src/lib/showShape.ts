import type { AggregateCastMember } from './tmdb';

/**
 * Works out what shape a show's cast has, so the cast view can match it.
 *
 * Built entirely from the single series-level aggregate_credits call — no per-episode fetching.
 *
 * ## Why the count, not the share
 *
 * The obvious metric is "what share of the cast appears in more than X% of episodes". Measured
 * against real shows, it doesn't work: cast size grows with episode count, so the share collapses
 * to near-zero for anything long-running, and a procedural becomes indistinguishable from an
 * anthology.
 *
 *   show               eps   cast   core   core SHARE   ← the failed metric
 *   Law & Order        545   7551      8       0.0011
 *   The Twilight Zone  156   1010      1       0.0010   ← same number, opposite shape
 *
 * The absolute size of the recurring company separates them cleanly:
 *
 *   The Sopranos        86    807     32   → ensemble
 *   Silicon Valley      53    332     22   → ensemble
 *   L&O: SVU           595   7610     10   → procedural
 *   Law & Order        545   7551      8   → procedural
 *   The Twilight Zone  156   1010      1   → anthology  (that 1 is the narrator)
 *   Black Mirror        33    560      0   → anthology
 *
 * A "1-episode share" signal was also tried and dropped: it sits at 0.67–0.96 for every show
 * above, ensembles included, so it discriminates nothing.
 */

export type ShowShape = 'ensemble' | 'procedural' | 'anthology';

/** A character counts toward the core if they're in more than this fraction of all episodes. */
export const CORE_EPISODE_RATIO = 0.2;

/**
 * At or below this many core characters, nobody really persists — a host or narrator at most.
 * Twilight Zone scores 1, Black Mirror 0.
 */
export const ANTHOLOGY_MAX_CORE = 1;

/**
 * At or above this many, the show is carried by a company rather than a fixed few. The least
 * evidenced of the three constants: it sits in the gap between SVU's 10 and Silicon Valley's 22,
 * with nothing sampled in between. Worth re-checking against more shows before trusting the edges.
 */
export const ENSEMBLE_MIN_CORE = 12;

export interface ShapeReport {
  shape: ShowShape;
  /** People appearing in more than CORE_EPISODE_RATIO of episodes. */
  coreCount: number;
  totalEpisodes: number;
  castSize: number;
  /** The episode threshold a person had to clear, in episodes. */
  coreThreshold: number;
}

/**
 * Returns null when there isn't enough to judge — no episode total, or an empty cast. Callers
 * should fall back to the existing grid rather than guessing a shape from nothing.
 */
export function classifyShow(cast: AggregateCastMember[], totalEpisodes: number): ShapeReport | null {
  if (!totalEpisodes || !cast.length) return null;

  const coreThreshold = CORE_EPISODE_RATIO * totalEpisodes;
  const coreCount = cast.filter((p) => p.episodeCount > coreThreshold).length;

  const shape: ShowShape =
    coreCount <= ANTHOLOGY_MAX_CORE ? 'anthology' : coreCount >= ENSEMBLE_MIN_CORE ? 'ensemble' : 'procedural';

  return { shape, coreCount, totalEpisodes, castSize: cast.length, coreThreshold };
}

/**
 * The cast that persists across the series, most-present first. This is the "Regulars" tier for a
 * procedural, and is empty for an anthology by construction — the same component covers both.
 */
export function coreCast(cast: AggregateCastMember[], totalEpisodes: number): AggregateCastMember[] {
  if (!totalEpisodes) return [];
  return cast
    .filter((p) => p.episodeCount > CORE_EPISODE_RATIO * totalEpisodes)
    .sort((a, b) => b.episodeCount - a.episodeCount);
}

/**
 * What a cast card can show beyond the character's own record, keyed by TMDb person id.
 * `firstSeason`/`lastSeason` are absent when the per-season lookup wasn't run or failed — the card
 * then shows the episode count alone rather than a wrong range.
 */
export interface CastMeta {
  episodeCount: number;
  firstSeason?: number;
  lastSeason?: number;
}

/** "31 eps" / "1 ep" — the distinction between a one-off and a recurring guest is the whole point. */
export function episodeCountLabel(count: number): string {
  return count === 1 ? '1 ep' : `${count} eps`;
}

/** "S2→S6", or "S4" when a character only ever appears in one season. */
export function seasonRangeLabel(first: number, last: number): string {
  return first === last ? `S${first}` : `S${first}→S${last}`;
}
