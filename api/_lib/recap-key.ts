/**
 * Cache-key derivation for shared recaps.
 *
 * The economics of this feature live in this file. A recap is keyed on the show and the point in
 * it — never on the user — so one generation serves everyone who ever reaches that episode, and
 * the bill scales with "episodes of television that exist" rather than with traffic.
 *
 * That is also why nothing personal goes into the generation. Feeding the reader's own cast list
 * in would produce a better paragraph for them and make the key a lie for everyone else: the
 * second viewer would be served the first viewer's names. If per-user recaps are ever wanted, they
 * need a different key and a different cost model, not a tweak here.
 *
 * Pure and I/O-free, like api/_lib/key.ts, and versioned separately from it. Sharing a version
 * with enrichment would mean that tuning the bio prompt silently threw away every recap already
 * paid for.
 */

/** Bump when the recap prompt, its schema, or the source window changes. */
export const RECAP_KEY_VERSION = 'v1';

export interface RecapTarget {
  showTmdbId: number;
  season: number;
  /** Inclusive upper bound, already resolved to a real episode number. */
  throughEpisode: number;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * Returns null when the target can't be identified. Callers should treat that as a 400: there is
 * nothing to look up and nothing worth generating.
 *
 * Season 0 is TMDb's specials bucket and is a legitimate season to be in, so it is allowed through
 * while the episode number is not — "up to and including episode 0" has no meaning.
 */
export function recapKey(target: RecapTarget): string | null {
  if (!isPositiveInt(target.showTmdbId)) return null;
  if (!Number.isInteger(target.season) || target.season < 0) return null;
  if (!isPositiveInt(target.throughEpisode)) return null;

  return `recap:${RECAP_KEY_VERSION}:tmdb:${target.showTmdbId}:s${target.season}:e${target.throughEpisode}`;
}
