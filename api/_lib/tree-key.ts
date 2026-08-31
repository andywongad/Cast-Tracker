/**
 * Cache-key derivation for seeded family trees.
 *
 * Same economics as api/_lib/recap-key.ts, and the same reasoning applies unchanged: the key names
 * the show and the point in it, never the reader, so one generation serves everyone who ever
 * imports that show at that episode and the bill scales with "shows that exist" rather than with
 * traffic. A tree is the cheapest of the three generated features per user by some distance —
 * one call per show, not one per character or one per episode reached.
 *
 * That is also why the reader's own cast list is not part of this key and not part of the
 * generation. Two people who imported the same episode may hold different cast lists — one hid a
 * character, one added a custom record — and keying on that would fragment a shared artifact into
 * a private one, at full price each. The generation runs against TMDb's credits for the episode,
 * which is the one list everybody's copy was made from, and the names are stored alongside the
 * tree so each client can match them back to its own record ids.
 *
 * Pure and I/O-free, versioned separately from enrichment and recaps. Sharing a version with
 * either would mean that tuning one prompt threw away everything the others had already paid for.
 */

/**
 * Bump when the tree prompt, its schema, the verifier's rules, the source narrowing, or the model
 * settings change — anything that would make today's generation differ from the one in the cache.
 *
 * v2: generation moved from effort `high` to `medium`. Without this bump every show generated
 * under v1 would keep serving its old tree forever, which is the failure the version exists to
 * prevent — and the reason a measured improvement would have been invisible on exactly the shows
 * people had already looked at.
 */
export const TREE_KEY_VERSION = 'v2';

export interface TreeTarget {
  showTmdbId: number;
  season: number;
  /** The episode the tree describes. Not a range — a tree is a snapshot, not an accumulation. */
  asOfEpisode: number;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * Returns null when the target can't be identified. Callers should treat that as a 400: there is
 * nothing to look up and nothing worth generating.
 *
 * Season 0 is TMDb's specials bucket and is a real season to be watching, so it is allowed through
 * while episode 0 is not — there is no such thing as the tree as of episode zero.
 */
export function treeKey(target: TreeTarget): string | null {
  if (!isPositiveInt(target.showTmdbId)) return null;
  if (!Number.isInteger(target.season) || target.season < 0) return null;
  if (!isPositiveInt(target.asOfEpisode)) return null;

  return `tree:${TREE_KEY_VERSION}:tmdb:${target.showTmdbId}:s${target.season}:e${target.asOfEpisode}`;
}
