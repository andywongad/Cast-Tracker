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
  parent: { label: 'Parent of', symmetric: false, directed: true },
  sibling: { label: 'Sibling', symmetric: true, directed: false },
  spouse: { label: 'Partner', symmetric: true, directed: false },
  other: { label: 'Related', symmetric: true, directed: false },
};

/** The kinds offered on a scripted show, in the order the picker lists them. */
export const KINSHIP_KINDS: MapRelKind[] = ['parent', 'sibling', 'spouse', 'other'];

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
