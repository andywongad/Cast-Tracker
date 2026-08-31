import type { MapCell, MapRelKind } from '../types';

/**
 * Arranging a family tree into generations, one family at a time.
 *
 * Driven by the "Tidy the tree" action on the relationship map, and by nothing else — it reads the
 * links already on the board and moves people, so it must never run on its own.
 *
 * The board's standing rule is that a person keeps the cell they were given and nobody the user
 * has placed is ever moved — which is what stops the layout reshuffling under someone mid-edit.
 * This file is the deliberate exception `resolveCells` already anticipated in its own comment: a
 * generational tidy-up, run only when asked for.
 *
 * What it produces, reading down the board:
 *
 *   - Each family is a band of its own, separated by a blank row. A cast of twenty-five is rarely
 *     one family; it is the Starks, the Lannisters, a couple of Targaryens and eleven people who
 *     are nobody's relative, and drawing those on top of each other is what makes a tree look like
 *     a knot.
 *   - Inside a band, generation is the row: grandparents, then parents and their siblings, then
 *     children and their cousins. Aunts and uncles land beside the parents because a sibling is a
 *     peer, and cousins land beside the children for the same reason — neither needs its own rule.
 *   - Everyone with no family at all goes below the last band, under a wider gap.
 *
 * Bands rather than columns because the grid is six wide and unbounded tall: four houses side by
 * side is the shape a printed family tree takes, and it does not fit here. Stacking them keeps
 * every family readable at the cost of scrolling, which is the right trade on a phone.
 *
 * Pure and I/O-free so the arrangement can be tested directly, which it is in familyLayout.test.ts.
 */

export interface LayoutPerson {
  id: string;
  /** Only used to keep the order stable when nothing else decides it. */
  name: string;
}

/** The same shape `buildEdges` produces: for `parent`, `aId` is the parent of `bId`. */
export interface LayoutLink {
  aId: string;
  bId: string;
  kind: MapRelKind;
}

export interface LayoutOptions {
  cols?: number;
  /** Where the first band starts. The board's own default puts row -3 near the top of the view. */
  topRow?: number;
}

const DEFAULT_COLS = 6;
const DEFAULT_TOP_ROW = -3;

/** One empty row between families, two before the people who have none. */
const BAND_GAP = 1;
const UNRELATED_GAP = 2;

/**
 * Kinds that make two people the same generation.
 *
 * `extended` is deliberately absent. It is the map's word for "related, no precise word" — which
 * covers cousins, who are peers, and aunts and grandparents, who are not. Treating it as a peer
 * link would flatten a grandmother into her grandchildren's row on the strength of a guess, so it
 * joins a family together without having any say in what row anyone lands on.
 */
const PEER_KINDS: MapRelKind[] = ['sibling', 'spouse'];

/** Kinds that put two people in the same family at all. Everything family-ish, `extended` included. */
const FAMILY_KINDS: MapRelKind[] = ['parent', 'sibling', 'spouse', 'extended'];

class DisjointSet {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) { this.parent.set(x, x); return x; }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/**
 * Layer the peer-groups of one family: a group sits one row below the lowest parent pointing at it.
 *
 * Longest path rather than shortest, so a grandparent who is also recorded as a great-aunt of
 * someone lands above both rather than being pulled up into the middle of the tree.
 *
 * Cycle-safe by construction. verify.ts already refuses a parent cycle between individuals, but
 * merging peers can still close one at the group level — marry into a family twice and the graph
 * says each group is above the other. Rather than fail, the edges that cannot be satisfied are
 * dropped: a slightly wrong row beats no tree at all, and the alternative is an infinite loop.
 */
function layerGroups(groups: string[], parentEdges: { from: string; to: string }[]): Map<string, number> {
  const indegree = new Map<string, number>(groups.map((g) => [g, 0]));
  const out = new Map<string, string[]>(groups.map((g) => [g, []]));
  for (const e of parentEdges) {
    if (e.from === e.to) continue; // A peer-group that is its own parent says nothing about rows.
    out.get(e.from)!.push(e.to);
    indegree.set(e.to, indegree.get(e.to)! + 1);
  }

  const gen = new Map<string, number>(groups.map((g) => [g, 0]));
  const queue = groups.filter((g) => indegree.get(g) === 0);
  let seen = 0;
  while (queue.length) {
    const g = queue.shift()!;
    seen++;
    for (const next of out.get(g)!) {
      gen.set(next, Math.max(gen.get(next)!, gen.get(g)! + 1));
      indegree.set(next, indegree.get(next)! - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // Anything left is inside a cycle; it keeps whatever row it reached, which is a guess but a
  // bounded one. Logged nowhere on purpose — it is not an error the user can act on.
  if (seen < groups.length) {
    for (const g of groups) if (!gen.has(g)) gen.set(g, 0);
  }
  return gen;
}

/**
 * Where everyone goes.
 *
 * Returns a cell for every person handed in, so the caller can persist the lot in one write.
 */
export function layoutTree(
  people: LayoutPerson[],
  links: LayoutLink[],
  opts: LayoutOptions = {},
): Record<string, MapCell> {
  const cols = opts.cols ?? DEFAULT_COLS;
  const topRow = opts.topRow ?? DEFAULT_TOP_ROW;

  const present = new Set(people.map((p) => p.id));
  const family = links.filter((l) => FAMILY_KINDS.includes(l.kind) && present.has(l.aId) && present.has(l.bId));

  // ---- Who is in a family with whom, and who is a peer of whom -------------
  const households = new DisjointSet();
  const peers = new DisjointSet();
  people.forEach((p) => { households.find(p.id); peers.find(p.id); });
  for (const l of family) {
    households.union(l.aId, l.bId);
    if (PEER_KINDS.includes(l.kind)) peers.union(l.aId, l.bId);
  }

  /** Families, largest first, so the biggest tree is the one at the top of the board. */
  const byHousehold = new Map<string, LayoutPerson[]>();
  for (const p of people) {
    const root = households.find(p.id);
    if (!byHousehold.has(root)) byHousehold.set(root, []);
    byHousehold.get(root)!.push(p);
  }
  const families = [...byHousehold.values()]
    .filter((m) => m.length > 1)
    .sort((a, b) => b.length - a.length || a[0].name.localeCompare(b[0].name));
  const loners = [...byHousehold.values()].filter((m) => m.length === 1).flat();

  const cells: Record<string, MapCell> = {};
  let row = topRow;

  /** Lay out one row of people, centred, wrapping when a generation is wider than the board. */
  const placeRow = (ids: string[], startRow: number): number => {
    let r = startRow;
    for (let i = 0; i < ids.length; i += cols) {
      const slice = ids.slice(i, i + cols);
      const offset = Math.floor((cols - slice.length) / 2);
      slice.forEach((id, n) => { cells[id] = { r, c: offset + n }; });
      r++;
    }
    return r;
  };

  for (const members of families) {
    const memberIds = new Set(members.map((m) => m.id));
    const groupOf = (id: string) => peers.find(id);

    const groups = [...new Set(members.map((m) => groupOf(m.id)))];
    const parentEdges = family
      .filter((l) => l.kind === 'parent' && memberIds.has(l.aId) && memberIds.has(l.bId))
      .map((l) => ({ from: groupOf(l.aId), to: groupOf(l.bId) }));

    const gen = layerGroups(groups, parentEdges);

    /**
     * Members of one peer-group stay together and in a fixed order, so a couple is drawn side by
     * side and their line is short. Sorting by name inside the group is arbitrary but stable —
     * what matters is that re-running the tidy produces the same board, or the button becomes a
     * thing people press twice to see what happens.
     */
    const byGeneration = new Map<number, string[]>();
    const groupsByGen = new Map<number, string[]>();
    for (const g of groups) {
      const n = gen.get(g) ?? 0;
      if (!groupsByGen.has(n)) groupsByGen.set(n, []);
      groupsByGen.get(n)!.push(g);
    }
    for (const [n, gs] of groupsByGen) {
      gs.sort();
      const ids: string[] = [];
      for (const g of gs) {
        const inGroup = members
          .filter((m) => groupOf(m.id) === g)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((m) => m.id);
        ids.push(...inGroup);
      }
      byGeneration.set(n, ids);
    }

    for (const n of [...byGeneration.keys()].sort((a, b) => a - b)) {
      row = placeRow(byGeneration.get(n)!, row);
    }
    row += BAND_GAP;
  }

  if (loners.length) {
    if (families.length) row += UNRELATED_GAP - BAND_GAP;
    placeRow(
      [...loners].sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.id),
      row,
    );
  }

  return cells;
}
