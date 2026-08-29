/**
 * Client side of /api/next-episode.
 *
 * Additive, like fetchTvmazeChannel next to it in tvmaze.ts: a failure here must leave the alert
 * card exactly as it was rather than showing an error about a line that is a nicety. Every
 * failure path returns null and the card simply says nothing about timing.
 */

export interface NextEpisode {
  /** Epoch ms. */
  airsAt: number;
  /** False when the upstream had only a date, which airWords() renders without a clock time. */
  exact: boolean;
  season: number | null;
  number: number | null;
  name: string | null;
}

export async function fetchNextEpisode(showTmdbId: number): Promise<NextEpisode | null> {
  try {
    const res = await fetch(`/api/next-episode?showId=${encodeURIComponent(String(showTmdbId))}`);
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<NextEpisode>;
    if (typeof data.airsAt !== 'number') return null;
    return {
      airsAt: data.airsAt,
      exact: !!data.exact,
      season: data.season ?? null,
      number: data.number ?? null,
      name: data.name ?? null,
    };
  } catch {
    return null;
  }
}
