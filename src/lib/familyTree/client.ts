import type { FamilyTree } from './types';

/**
 * Client side of the family-tree endpoint.
 *
 * Deliberately dumb, like src/lib/recap/client.ts and src/lib/enrichment/client.ts: one call, one
 * state value, no local cache. The cache that matters is the shared one on the server — a tree is
 * keyed on the show and the episode, not on the person importing it, so the first user of a show
 * pays for it and everyone after is served the same tree for free.
 *
 * Called when someone asks for a tree, never on render. Nothing here should fire because a map
 * opened.
 */

export type FamilyTreeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: FamilyTree }
  /**
   * We looked and there is no tree to be had: no article, or an article that never says how anyone
   * is related. The common answer for procedurals, panel shows and most reality television.
   */
  | { status: 'unavailable' }
  /** Something that might not go wrong next time. */
  | { status: 'error' };

export async function fetchFamilyTree(params: {
  showTmdbId: number | null;
  showTitle: string;
  season: number;
  asOfEpisode: number;
}): Promise<FamilyTreeState> {
  // Hand-added shows have no TMDb id, so there are no episode credits to build a closed cast list
  // from — and without that list the index lock in verify.ts has nothing to lock against.
  if (!params.showTmdbId) return { status: 'unavailable' };
  if (!Number.isInteger(params.asOfEpisode) || params.asOfEpisode < 1) {
    return { status: 'unavailable' };
  }

  const qs = new URLSearchParams({
    showId: String(params.showTmdbId),
    showTitle: params.showTitle,
    season: String(params.season),
    episode: String(params.asOfEpisode),
  });

  try {
    const res = await fetch(`/api/family-tree?${qs.toString()}`);
    if (res.status === 404) return { status: 'unavailable' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ready', data: (await res.json()) as FamilyTree };
  } catch {
    return { status: 'error' };
  }
}
