import { normalizeName } from '../../src/lib/tvmaze';

/**
 * Cache-key derivation for shared enrichment.
 *
 * The point of this cache is that one generation serves every user, so the key has to be something
 * two strangers independently arrive at. `CastMember.id` is not that — it's `genId('p')`, minted
 * locally when a character is added, so the same character has a different id on every device. A
 * key built from it would have a 0% cross-user hit rate.
 *
 * What is stable: TMDb's show id, and TMDb's *person* id for the actor. Within one show an actor
 * maps to one character in all but a handful of cases, which makes the pair a reliable identity.
 * When the actor is unknown (hand-entered characters), we fall back to the normalized character
 * name — weaker, but it still collapses "Tony Soprano" and "tony soprano " to one entry.
 *
 * Pure and I/O-free on purpose: this is the piece most worth reasoning about directly.
 */

/**
 * Bump when the prompt, the schema, or the source strategy changes. Old entries then become
 * unreachable rather than being served as if they came from the new pipeline — cheaper and safer
 * than migrating rows, since anything dropped is regenerable.
 */
export const KEY_VERSION = 'v1';

/** Long enough for real names, short enough that a hostile 10KB "name" can't bloat the keyspace. */
const MAX_SLUG_LENGTH = 80;

export interface EnrichmentTarget {
  showTmdbId: number;
  actorTmdbId?: number | null;
  characterName?: string | null;
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/**
 * Returns null when the target can't be identified — no valid show id, and neither an actor id nor
 * a name that survives normalization. Callers should treat null as a 400, not as a cache miss:
 * there is nothing to look up and nothing worth generating.
 */
export function enrichmentKey(target: EnrichmentTarget): string | null {
  if (!isPositiveInt(target.showTmdbId)) return null;

  const prefix = `enrich:${KEY_VERSION}:tmdb:${target.showTmdbId}`;

  if (isPositiveInt(target.actorTmdbId)) {
    return `${prefix}:person:${target.actorTmdbId}`;
  }

  // normalizeName already lowercases, strips diacritics, parentheticals, titles and punctuation —
  // the same treatment the TVmaze matcher uses, so both paths agree on what one name is.
  const slug = normalizeName(target.characterName).replace(/\s+/g, '-').slice(0, MAX_SLUG_LENGTH);
  if (!slug) return null;

  return `${prefix}:name:${slug}`;
}
