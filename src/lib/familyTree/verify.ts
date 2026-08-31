import { TREE_REL_KINDS, type FamilyTree, type TreeEdge, type TreeRelKind } from './types.js';

/**
 * What a proposed family tree has to survive before anyone sees it.
 *
 * This file is to the tree what src/lib/recap/window.ts is to the recap: the real enforcement,
 * pulled out of the generator so it can be tested without a network or a key. The prompt in
 * api/_lib/generate-tree.ts is the second lock, not the first — a rule a model is asked to follow
 * is a request it can decline, and this feature writes into the user's own library.
 *
 * The threat is specific and worth naming, because it is not "the model lies". It is that the model
 * knows the show. Every source article about a television series describes the whole series, and
 * the model's own memory reaches further still — so the failure mode is not invention, it is a
 * perfectly true fact from season six arriving in a tree built from episode one. Jon Snow's
 * parentage is the canonical case: the answer a model reaches for is correct, and it ruins the
 * show for someone eight episodes in.
 *
 * Three locks, in order of how much they actually buy:
 *
 *   1. Indices, not names. The model picks from a numbered list of the characters this episode
 *      credits. A character who has not appeared cannot be referenced at all — not misspelled, not
 *      approximated. This is airtight for *who*, and costs nothing.
 *   2. Evidence, quoted and checked. Every edge carries a span the model claims says so, and an
 *      edge whose span is not in the source text we fetched is dropped. This is what downgrades
 *      "the model asserted it" to "the text said it", and it catches the season-six fact precisely
 *      because the source paragraph describing episode one does not contain it.
 *   3. Shape. Nobody is their own parent, parent links do not form cycles, nobody has five parents,
 *      and one pair holds one relationship. These catch confusion rather than spoilers, but a tree
 *      that draws Robb as his father's father is one users delete rather than adjust.
 *
 * What none of this buys: a spoiler that is *in the source paragraph* survives all three locks. The
 * mitigation for that is choosing a narrow source (see tree-source.ts) and marking every seeded
 * record `auto`, so a user's correction is permanent and a wrong seed is one tap from gone. Said
 * plainly because the alternative is someone later assuming this file is airtight.
 */

/** Long enough that a quote has to be a real span. "the" appears in every article ever written. */
const MIN_EVIDENCE_CHARS = 24;

/** Bounded so a runaway response cannot push a thousand lines into someone's map. */
const MAX_EDGES = 60;

/**
 * Two, because a tree seeded from one episode is describing parentage as that episode presents it,
 * and an episode that presents three parents for one child has almost certainly presented a
 * step-parent the model flattened. The map has `extended` for exactly that, and the user can add
 * the third by hand — which is a better outcome than a tree nobody trusts.
 */
const MAX_PARENTS = 2;

export interface VerifyReport {
  kept: number;
  /** Why the rest were dropped, most common first. Surfaced in logs, not to the user. */
  dropped: { reason: string; count: number }[];
}

const DROP_REASONS = [
  'malformed',
  'unknown_kind',
  'index_out_of_range',
  'self_link',
  'evidence_too_short',
  'evidence_not_in_source',
  'duplicate_pair',
  'parent_cycle',
  'too_many_parents',
  'over_limit',
] as const;
type DropReason = (typeof DROP_REASONS)[number];

/**
 * Compare quoted evidence to the source the way a reader would, not the way a byte comparison
 * would. Models reflow whitespace and normalise punctuation when they quote — a check that treats
 * a curly apostrophe as a different character rejects honest quotations and teaches nobody
 * anything. Everything here is lossy in the safe direction: it can accept a quote that differs
 * cosmetically, never one that differs in words.
 */
function flatten(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `parent` edges only. Can `from` already be reached by walking down from `to`? */
function reaches(edges: { from: number; to: number }[], start: number, target: number): boolean {
  const seen = new Set<number>();
  const stack = [start];
  while (stack.length) {
    const at = stack.pop()!;
    if (at === target) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const e of edges) if (e.from === at) stack.push(e.to);
  }
  return false;
}

/**
 * Turn whatever the model returned into the edges a map may actually be seeded with.
 *
 * Takes `unknown` deliberately. The schema is enforced by the API, and this still does not trust
 * the result — this is the boundary between someone else's output and records written into a
 * user's own library, which is not a place to save a type assertion.
 */
export function verifyTree(
  raw: unknown,
  input: { castSize: number; source: string },
): { edges: TreeEdge[]; report: VerifyReport } {
  const counts = new Map<DropReason, number>();
  const drop = (reason: DropReason) => counts.set(reason, (counts.get(reason) ?? 0) + 1);

  const proposed = Array.isArray(raw) ? raw : [];
  const flatSource = flatten(input.source);

  const kept: TreeEdge[] = [];
  /** Unordered for the symmetric kinds, ordered for `parent` — see the duplicate rule below. */
  const seenPairs = new Set<string>();
  const parentEdges: { from: number; to: number }[] = [];
  const parentCount = new Map<number, number>();

  for (const item of proposed) {
    if (kept.length >= MAX_EDGES) { drop('over_limit'); continue; }

    if (!item || typeof item !== 'object') { drop('malformed'); continue; }
    const e = item as Record<string, unknown>;

    const from = e.from;
    const to = e.to;
    const kind = e.kind;
    const evidence = e.evidence;

    if (!Number.isInteger(from) || !Number.isInteger(to) || typeof evidence !== 'string') {
      drop('malformed');
      continue;
    }
    if (typeof kind !== 'string' || !(TREE_REL_KINDS as readonly string[]).includes(kind)) {
      drop('unknown_kind');
      continue;
    }
    const a = from as number;
    const b = to as number;
    if (a < 0 || b < 0 || a >= input.castSize || b >= input.castSize) {
      // Lock 1. Usually a character from later in the series, named with total confidence.
      drop('index_out_of_range');
      continue;
    }
    if (a === b) { drop('self_link'); continue; }

    const quote = evidence.trim();
    if (quote.length < MIN_EVIDENCE_CHARS) { drop('evidence_too_short'); continue; }
    if (!flatSource.includes(flatten(quote))) {
      // Lock 2. The one that catches a true fact the source never stated.
      drop('evidence_not_in_source');
      continue;
    }

    /**
     * The parent rules run before the pair rule, because `parent` is the one ordered kind and the
     * two rules disagree about what a reversed edge is. To the unordered pair rule, "Ned is Robb's
     * father" and "Robb is Ned's father" look like the same pair said twice; they are in fact
     * contradictory claims, and calling that a duplicate would file the most diagnostic thing the
     * model can tell us about its own confusion under the least interesting heading.
     */
    if (kind === 'parent') {
      if ((parentCount.get(b) ?? 0) >= MAX_PARENTS) { drop('too_many_parents'); continue; }
      // Adding a→b closes a cycle when b can already reach a by walking down the tree.
      if (reaches(parentEdges, b, a)) { drop('parent_cycle'); continue; }
    }

    /**
     * One relationship per pair. The map itself is happy to draw two — a pair recorded as both
     * siblings and spouses stays two lines, deliberately, because two people asserting different
     * things is information. A seed is not two people; it is one model contradicting itself, and
     * first-wins is the honest reading of that.
     */
    const pairKey = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (seenPairs.has(pairKey)) { drop('duplicate_pair'); continue; }

    // Every check has passed. Record the edge and only now update the state the checks read from —
    // mutating earlier would let a row that is about to be dropped still count against a later one.
    if (kind === 'parent') {
      parentEdges.push({ from: a, to: b });
      parentCount.set(b, (parentCount.get(b) ?? 0) + 1);
    }
    seenPairs.add(pairKey);
    kept.push({ from: a, to: b, kind: kind as TreeRelKind, evidence: quote });
  }

  return {
    edges: kept,
    report: {
      kept: kept.length,
      dropped: [...counts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((x, y) => y.count - x.count),
    },
  };
}

/**
 * The tree with its quotations removed, for sending to a browser.
 *
 * Lives here rather than in the handler because this is the file that owns the evidence rule, and
 * because a guarantee about spoilers is worth a test — which a function inside an api/ route would
 * not get, the suites all bundling from src/.
 *
 * The quotes are the most spoiler-dense text this feature touches: "Eddard is the parent of Sansa"
 * is safe on any episode, while the sentence proving it, pulled from an article about the whole
 * series, may be about his execution. The server keeps them, the browser never receives them.
 */
export function stripEvidence(tree: FamilyTree): FamilyTree {
  return { ...tree, edges: tree.edges.map(({ evidence: _quoted, ...edge }) => edge) };
}
