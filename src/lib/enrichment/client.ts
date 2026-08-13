import type { Enrichment } from './types';

/**
 * Client side of the enrichment endpoint.
 *
 * Deliberately dumb: one call, one state value, no caching here. The cache that matters is the
 * shared one on the server — a second local layer would just add a way for the two to disagree.
 *
 * Called once per character, when its detail sheet opens. Never from the cast grid: that renders
 * 40 cards at a time, and a fetch-on-mount there would turn "looked at a show" into "generated 40
 * bios", most of them for characters nobody opened.
 */

export type EnrichmentState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Enrichment }
  /** No source exists for this character. Expected, common, and not worth an error message. */
  | { status: 'unavailable' }
  /** Something went wrong that might not go wrong next time — worth offering a retry. */
  | { status: 'error' };

export async function fetchEnrichment(params: {
  showTmdbId: number | null;
  showTitle: string;
  characterName: string;
  actorTmdbId?: number | null;
}): Promise<EnrichmentState> {
  // Hand-added shows have no TMDb id, so there's nothing to key a shared lookup on.
  if (!params.showTmdbId || !params.characterName.trim()) return { status: 'unavailable' };

  const qs = new URLSearchParams({
    showId: String(params.showTmdbId),
    showTitle: params.showTitle,
    characterName: params.characterName,
  });
  if (params.actorTmdbId) qs.set('actorId', String(params.actorTmdbId));

  try {
    const res = await fetch(`/api/enrichment?${qs.toString()}`);
    if (res.status === 404) return { status: 'unavailable' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ready', data: (await res.json()) as Enrichment };
  } catch {
    return { status: 'error' };
  }
}
