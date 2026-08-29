/**
 * Shared types for AI-generated "previously on" recaps.
 *
 * Free of server-only imports for the same reason src/lib/enrichment/types.ts is: the client
 * renders this shape, and nothing that touches an API key belongs in the browser bundle.
 *
 * A recap is a sibling of an Enrichment, not a variant of it. They cache separately, version
 * separately and are capped separately — a recap is several times the tokens of a bio, so sharing
 * a counter would let recaps starve the feature that pays for itself on every cast card.
 */

export interface Recap {
  /**
   * The recap itself. A short paragraph, past tense, covering the season up to and including
   * `throughEpisode` — and nothing after it.
   */
  text: string;
  /**
   * The two or three things most worth remembering, as short lines. Rendered above the paragraph:
   * someone who opened this thirty seconds before pressing play reads these and stops.
   */
  beats: string[];
  season: number;
  /** The last episode covered. The boundary is the whole safety story — see generate-recap.ts. */
  throughEpisode: number;
  /** How many episodes' text went in. Lets the UI say "13 episodes" without recounting. */
  episodesCovered: number;
  /** Where the source text came from. Set from the fetch, never from the model. */
  sourceUrl: string;
  modelVersion: string;
  /** ISO 8601. */
  generatedAt: string;
}

/**
 * What the cache holds. `unavailable` means we looked and there is not enough source text to
 * recap — a season of one-word TMDb overviews with nothing in them. That is a real answer, not a
 * failure to retry, and without it every view of a thinly-documented show re-runs the pipeline.
 *
 * Transient failures are never stored, exactly as in enrichment: caching a rate limit or a socket
 * hangup freezes a few minutes of trouble into a lasting "no".
 */
export type StoredRecap =
  | { status: 'ready'; data: Recap }
  | { status: 'unavailable'; reason: string; at: string };

/** The seam between recap logic and wherever the data physically lives. */
export interface RecapStore {
  get(key: string): Promise<StoredRecap | null>;
  putReady(key: string, data: Recap): Promise<void>;
  putUnavailable(key: string, reason: string, ttlSeconds: number): Promise<void>;
}
