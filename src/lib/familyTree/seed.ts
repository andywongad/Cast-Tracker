import type { CastMember, MapRelationship, MapRelKind } from '../../types';
import { normalizeName } from '../tvmaze';
import type { FamilyTree, TreeRelKind } from './types';

/**
 * Turning a generated family tree into relationship records for one library.
 *
 * The server generates against TMDb's credits for the episode — one canonical list, so one
 * generation serves everyone (see api/_lib/tree-key.ts). This file is the other half of that
 * bargain: every client resolves those names back to its own record ids, because the ids are local
 * and always were.
 *
 * Two rules govern everything here, and both exist so that "a foundation to adjust" is true rather
 * than aspirational:
 *
 *   1. The user's work is never touched. A pair that already has any relationship between them —
 *      drawn, renamed, or seeded earlier — is skipped whole. Not merged, not preferred, skipped.
 *      Seeding is additive or it is nothing.
 *   2. Everything written is marked `auto`, so a later re-seed can replace what the user ignored
 *      and leave what they touched.
 *
 * Pure: it returns a plan rather than performing writes, so the rules above can be tested without
 * a store, a component, or a network. The caller applies it.
 */

/** Bounded so a seed cannot bury a small cast under links nobody asked for. */
const MAX_SEEDED_LINKS = 40;

/** Which kinds are written from both ends. Mirrors REL_KINDS in lib/relationshipEdges.ts. */
const SYMMETRIC: Record<TreeRelKind, boolean> = {
  parent: false,
  sibling: true,
  spouse: true,
  extended: true,
};

/** The words a seeded link carries, matching REL_KINDS' labels exactly. */
const LABELS: Record<TreeRelKind, string> = {
  parent: 'Parent of',
  sibling: 'Sibling',
  spouse: 'Spouse',
  extended: 'Relative',
};

export interface SeedWrite {
  /** Whose card the record goes on. */
  castId: string;
  targetId: string;
  kind: MapRelKind;
  label: string;
}

export interface SeedPlan {
  writes: SeedWrite[];
  /**
   * How many lines this plan draws — not how many records it writes.
   *
   * The two differ because the symmetric kinds are stored from both ends and drawn once, and it is
   * the drawn number that a user can count on the board. Reported here rather than recomputed by
   * the caller, which would have to know the storage rule to get it right.
   */
  links: number;
  /** How many of the tree's characters were found in this library. */
  matched: number;
  /** Links the tree proposed that this library will not get, and why. Shown as a count, not a list. */
  skipped: { notInLibrary: number; alreadyLinked: number; overLimit: number };
}

/**
 * Match the tree's names to this library's records.
 *
 * Exact match on the normalized name, and deliberately nothing cleverer. Both sides descend from
 * the same TMDb character strings — the server read the episode credits, the app read them when
 * the show was imported — so an exact match is the overwhelmingly common case, and a fuzzy fallback
 * here would buy a few extra links at the price of occasionally linking the wrong two people in
 * someone's own library. `normalizeName` already absorbs the differences that actually occur:
 * case, accents, parenthetical asides, titles.
 *
 * A name that matches two records is dropped rather than guessed at, for the same reason.
 */
function resolveNames(names: string[], cast: CastMember[]): (string | null)[] {
  const byName = new Map<string, string | null>();
  for (const c of cast) {
    const key = normalizeName(c.name);
    if (!key) continue;
    // null marks a name more than one record answers to — ambiguous, so unusable.
    byName.set(key, byName.has(key) ? null : c.id);
  }
  return names.map((n) => byName.get(normalizeName(n)) ?? null);
}

/**
 * Build the writes for one episode's map.
 *
 * `relsFor` reads the relationships already on a record for the episode being seeded — the same
 * accessor shape `buildEdges` takes, so callers pass the function they already have.
 */
export function planSeed(
  tree: FamilyTree,
  cast: CastMember[],
  relsFor: (c: CastMember) => MapRelationship[],
): SeedPlan {
  const ids = resolveNames(tree.names, cast);
  const matched = ids.filter(Boolean).length;

  /** Every pair that already has something between them, in either direction. */
  const taken = new Set<string>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (const c of cast) {
    for (const rel of relsFor(c)) taken.add(pairKey(c.id, rel.targetId));
  }

  const writes: SeedWrite[] = [];
  const skipped = { notInLibrary: 0, alreadyLinked: 0, overLimit: 0 };
  let links = 0;

  for (const edge of tree.edges) {
    const fromId = ids[edge.from] ?? null;
    const toId = ids[edge.to] ?? null;
    if (!fromId || !toId || fromId === toId) { skipped.notInLibrary++; continue; }

    const key = pairKey(fromId, toId);
    if (taken.has(key)) { skipped.alreadyLinked++; continue; }
    if (links >= MAX_SEEDED_LINKS) { skipped.overLimit++; continue; }

    const kind = edge.kind as MapRelKind;
    const label = LABELS[edge.kind];

    writes.push({ castId: fromId, targetId: toId, kind, label });
    /**
     * Both halves for the symmetric kinds, exactly as createKinship does when a user draws one.
     * The map reads relationships off whoever holds them, so a sibling recorded on one side only
     * would vanish the moment that person was hidden — and buildEdges collapses the pair back into
     * a single line, so a seeded link is indistinguishable from a drawn one.
     */
    if (SYMMETRIC[edge.kind]) writes.push({ castId: toId, targetId: fromId, kind, label });

    taken.add(key);
    links++;
  }

  return { writes, links, matched, skipped };
}
