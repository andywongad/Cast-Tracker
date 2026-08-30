import type { CastMember, MapRelationship, MapRelKind } from '../types';

/**
 * Turning one episode's stored relationships into the lines a map should draw.
 *
 * Pulled out of RelationshipMap because the merging rule is the fiddly part and it is now three
 * rules rather than one. The board used to know a single trick — two people each pointing at the
 * other became a heart — and kinship needs more: a parent link is directed and must never merge
 * with anything, while "sibling" recorded from both ends is one fact written twice and has to
 * collapse, or every family draws itself with doubled lines.
 *
 * Pure and I/O-free so the rules can be tested directly; they are, in relationshipEdges.test.ts.
 */

/** How each kind behaves. `symmetric` decides merging; `directed` decides the arrowhead. */
export const REL_KINDS: Record<MapRelKind, { label: string; symmetric: boolean; directed: boolean }> = {
  interested: { label: 'Interested', symmetric: true, directed: true },

  /**
   * `parent` is the only asymmetric relationship here, and that is not an accident of the list —
   * it is the only one where the two people are not the same thing to each other. Everything else
   * is a description both of them would give, which is why it merges into one line and carries no
   * arrowhead. A new kind that fails that test needs `symmetric: false` and its own thought.
   */
  parent: { label: 'Parent of', symmetric: false, directed: true },
  sibling: { label: 'Sibling', symmetric: true, directed: false },
  spouse: { label: 'Spouse', symmetric: true, directed: false },
  /** Cousins, in-laws, the aunt who turns up at Christmas — family without a precise word. */
  extended: { label: 'Relative', symmetric: true, directed: false },

  /**
   * "Partner" is the natural noun and it is safe to use here only because of its neighbours:
   * `spouse` and `colleague` both say their own word plainly, so nothing is left for this one to
   * be confused with. Alone in the list it would have been the ambiguous option.
   */
  romantic: { label: 'Partner', symmetric: true, directed: false },
  friend: { label: 'Friend', symmetric: true, directed: false },
  frenemy: { label: 'Frenemy', symmetric: true, directed: false },
  /**
   * "Enemy" rather than "foe", which reads as a fantasy show even on a fantasy show — and which
   * would sit oddly next to `frenemy`, a word built out of this one.
   *
   * Symmetric, like friend and frenemy, which is a simplification worth naming: television is full
   * of one-sided rivalries where the other party has not noticed. That is what the free-text kind
   * is for, and the alternative — a second directed kind — would cost the invariant that `parent`
   * is the only relationship where the two people are not the same thing to each other.
   */
  enemy: { label: 'Enemy', symmetric: true, directed: false },

  /**
   * "Colleague", not "partner" — which in a cop show means one thing and in a sitcom another, and
   * which the romantic kind above has now claimed outright.
   */
  colleague: { label: 'Colleague', symmetric: true, directed: false },
  roommate: { label: 'Roommate', symmetric: true, directed: false },
  classmate: { label: 'Classmate', symmetric: true, directed: false },

  other: { label: 'Related', symmetric: true, directed: false },
};

/**
 * How the picker groups them.
 *
 * Eleven options is past what a row of chips can hold in a panel this size, and past what anyone
 * reads as a set — so they are grouped and put in a dropdown, where the headings do the work of
 * telling you which half of the list to look in. `other` is deliberately outside the groups: it is
 * the escape hatch, not a category.
 */
export const KIND_GROUPS: { label: string; kinds: MapRelKind[] }[] = [
  { label: 'Family', kinds: ['parent', 'sibling', 'spouse', 'extended'] },
  { label: 'Personal', kinds: ['romantic', 'friend', 'frenemy', 'enemy'] },
  { label: 'Work & school', kinds: ['colleague', 'roommate', 'classmate'] },
];

/** Every kind the picker offers, groups first and the escape hatch last. */
export const KINSHIP_KINDS: MapRelKind[] = [...KIND_GROUPS.flatMap((g) => g.kinds), 'other'];

export interface Edge {
  /** Stable across renders: the id of the relationship record that anchors this line. */
  key: string;
  aId: string;
  bId: string;
  kind: MapRelKind;
  label: string;
  /** Draw an arrowhead at `bId`. False for symmetric kinship, which has no "from". */
  directed: boolean;
  /** True when a reciprocal pair was collapsed into this one line. */
  mutual: boolean;
  /** Every underlying record, so deleting the line deletes both halves of a merged pair. */
  parts: { sourceId: string; relId: string }[];
}

/**
 * Build the lines for one episode.
 *
 * `interested` keeps its old meaning exactly: one-way stays an arrow, reciprocated becomes a
 * mutual line — which the map draws as a heart. Nothing about the dating board changes.
 */
export function buildEdges(cast: CastMember[], relsFor: (c: CastMember) => MapRelationship[]): Edge[] {
  const all: { sourceId: string; rel: MapRelationship }[] = [];
  const present = new Set(cast.map((c) => c.id));
  cast.forEach((c) => relsFor(c).forEach((rel) => {
    // A link to someone hidden or removed has nothing to draw between.
    if (present.has(rel.targetId)) all.push({ sourceId: c.id, rel });
  }));

  const consumed = new Set<string>();
  const edges: Edge[] = [];

  for (const { sourceId, rel } of all) {
    if (consumed.has(rel.id)) continue;
    const meta = REL_KINDS[rel.kind] ?? REL_KINDS.other;

    /**
     * A reciprocal is the same kind pointing back. Same kind matters: someone recorded as the
     * parent of a person who is recorded as their sibling is two different claims, and collapsing
     * them would silently drop one.
     */
    const reciprocal = meta.symmetric
      ? all.find((o) => o.sourceId === rel.targetId && o.rel.targetId === sourceId && o.rel.kind === rel.kind && !consumed.has(o.rel.id))
      : undefined;

    consumed.add(rel.id);
    if (reciprocal) consumed.add(reciprocal.rel.id);

    edges.push({
      key: rel.id,
      aId: sourceId,
      bId: rel.targetId,
      kind: rel.kind,
      label: rel.label || meta.label,
      directed: meta.directed && !reciprocal,
      mutual: !!reciprocal,
      parts: reciprocal
        ? [{ sourceId, relId: rel.id }, { sourceId: reciprocal.sourceId, relId: reciprocal.rel.id }]
        : [{ sourceId, relId: rel.id }],
    });
  }

  return edges;
}

/**
 * Who sits above whom, for placing someone new.
 *
 * Not a layout engine, and deliberately not one yet: the board's rule is that a person keeps the
 * cell they were given and nobody the user has placed is ever moved. So this only answers the
 * narrow question a newcomer asks — "is anyone here my parent?" — and the caller uses it to start
 * them one row down rather than in the first free slot at the top.
 */
export function parentIdsOf(castId: string, cast: CastMember[], relsFor: (c: CastMember) => MapRelationship[]): string[] {
  const out: string[] = [];
  for (const c of cast) {
    for (const rel of relsFor(c)) {
      if (rel.kind === 'parent' && rel.targetId === castId) out.push(c.id);
    }
  }
  return out;
}
