import type { Recap } from './types';

/**
 * Client side of the recap endpoint.
 *
 * Deliberately dumb, for the same reason as src/lib/enrichment/client.ts: one call, one state
 * value, no local cache. The cache that matters is the shared one on the server — a recap is keyed
 * on the show and the episode, not on the person reading it, so the first viewer of an episode
 * pays for it and everyone after is served the same paragraph for free.
 *
 * Called when the recap sheet opens, never on the show screen. Nothing here should fire because a
 * grid rendered.
 */

export type RecapState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: Recap }
  /** Not enough source text to recap this season. Common on shows with one-line overviews. */
  | { status: 'unavailable' }
  /** Something that might not go wrong next time. The sheet falls back to the TMDb text. */
  | { status: 'error' };

export async function fetchRecap(params: {
  showTmdbId: number | null;
  showTitle: string;
  season: number;
  /** Inclusive, and already resolved — the caller must not send "whatever the last one was". */
  throughEpisode: number;
}): Promise<RecapState> {
  // Hand-added shows have no TMDb id, so there are no episode summaries to recap and nothing
  // stable to key a shared lookup on.
  if (!params.showTmdbId) return { status: 'unavailable' };
  if (!Number.isInteger(params.throughEpisode) || params.throughEpisode < 1) {
    return { status: 'unavailable' };
  }

  const qs = new URLSearchParams({
    showId: String(params.showTmdbId),
    showTitle: params.showTitle,
    season: String(params.season),
    episode: String(params.throughEpisode),
  });

  try {
    const res = await fetch(`/api/recap?${qs.toString()}`);
    if (res.status === 404) return { status: 'unavailable' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ready', data: (await res.json()) as Recap };
  } catch {
    return { status: 'error' };
  }
}
