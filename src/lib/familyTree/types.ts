/**
 * Shared types for the seeded family tree.
 *
 * Free of imports, like src/lib/recap/types.ts and src/lib/enrichment/types.ts next door. Both
 * module systems consume this file — `src/` under bundler resolution and `api/` under NodeNext —
 * and the cheapest way to keep one file honest in two worlds is to give it nothing to resolve.
 *
 * A tree is a sibling of a Recap, not a variant of it: keyed differently, versioned separately,
 * capped separately. What it shares with both is the economics — the key names the show and the
 * episode, never the reader, so one generation serves everyone who ever imports that show.
 */

/**
 * The kinds a seeded tree may contain.
 *
 * Deliberately four, and deliberately a subset of MapRelKind rather than a new vocabulary — the
 * seed writes ordinary relationship records that are indistinguishable from hand-drawn ones, which
 * is the whole point of seeding rather than inventing a parallel "suggested" layer. The subset is
 * checked against MapRelKind at compile time in familyTree.test.ts; this file cannot import it
 * without giving itself a module-resolution problem it does not otherwise have.
 *
 * The personal kinds — friend, enemy, partner — are missing on purpose. A first episode establishes
 * who people are *to each other by blood or marriage* far more reliably than it establishes who
 * likes whom, and a seed that guesses at feelings is a seed users have to argue with.
 */
export const TREE_REL_KINDS = ['parent', 'sibling', 'spouse', 'extended'] as const;
export type TreeRelKind = (typeof TREE_REL_KINDS)[number];

/**
 * One link that survived verification.
 *
 * `from` and `to` are indices into the cast list that was sent to the model, not names and not
 * record ids. That is the first of the three locks described in verify.ts: a model that can only
 * return numbers in a range cannot introduce a character who is not in the episode, however
 * confidently it remembers one. Names are resolved back to CastMember ids at seed time, on the
 * client, where the ids actually live.
 *
 * For `parent` the direction is load-bearing and matches MapRelKind's: `from` is the parent OF
 * `to`. The other three are symmetric and the order is arbitrary.
 */
export interface TreeEdge {
  from: number;
  to: number;
  kind: TreeRelKind;
  /**
   * The sentence in the source text that says so, quoted. Server-side only.
   *
   * Not decoration and not an audit nicety — it is load-bearing. An edge whose evidence cannot be
   * found in the source we fetched is discarded, which is what turns "the model asserted this"
   * into "the text we read said this". See verify.ts.
   *
   * Optional because it is stripped before the tree is sent to a browser, and the reason is worth
   * stating plainly: the quotes are the most spoiler-dense text in this whole feature. A link
   * saying "Eddard is the parent of Sansa" is safe on any episode; the sentence proving it, pulled
   * from a series-wide article, may be about his execution. The verifier needs the quote, the KV
   * row keeps it so a bad tree can be audited later, and the client is never given it — nothing
   * there renders it today, and "nothing renders it" is a guarantee that lasts exactly until
   * someone adds a debug view.
   */
  evidence?: string;
}

export interface FamilyTree {
  edges: TreeEdge[];
  /**
   * The cast list the indices point into, in the order it was sent.
   *
   * Stored with the tree rather than reconstructed by the caller, because the caller's cast list
   * moves — someone hides a character, an episode import adds four more — and indices resolved
   * against a different list than the one the model saw are silently wrong rather than loudly so.
   */
  names: string[];
  season: number;
  /**
   * The episode this tree describes, and the entire spoiler story.
   *
   * A tree is a snapshot of what one episode has established, not a summary of the show. Asking
   * again from a later episode is a different key and a different generation — never an edit to
   * this one, which would rewrite history under a reader who is still behind.
   */
  asOfEpisode: number;
  /** Where the source text came from. Set from the fetch, never from the model. */
  sourceUrl: string;
  modelVersion: string;
  /** ISO 8601. */
  generatedAt: string;
}

/**
 * What the cache holds.
 *
 * `unavailable` means we looked and there is nothing to build a tree from — no article, or an
 * article that never says how anyone is related. That is the normal outcome for a large share of
 * shows and a real answer worth remembering, not a failure to retry. Transient failures are never
 * stored, exactly as in enrichment and recaps.
 */
export type StoredFamilyTree =
  | { status: 'ready'; data: FamilyTree }
  | { status: 'unavailable'; reason: string; at: string };

/** The seam between tree logic and wherever the data physically lives. */
export interface FamilyTreeStore {
  get(key: string): Promise<StoredFamilyTree | null>;
  putReady(key: string, data: FamilyTree): Promise<void>;
  putUnavailable(key: string, reason: string, ttlSeconds: number): Promise<void>;
}
