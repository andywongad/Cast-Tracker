/**
 * Shared types for AI-generated character enrichment.
 *
 * This file is deliberately free of server-only imports (no Anthropic SDK, no storage client) so
 * the client can import the shape it renders without dragging server code into the browser bundle.
 * Everything that touches an API key lives under api/_lib/ instead.
 *
 * Field names are camelCase to match src/types.ts. The brief described them as snake_case columns
 * (`role_tag`, `source_url`, …) — that's the same data, spelled the way the rest of this codebase
 * spells things.
 */

/** How central the character is to the show. Kept as a closed set so the UI can style each case. */
export const ROLE_TAGS = ['main', 'supporting', 'recurring', 'guest'] as const;
export type RoleTag = (typeof ROLE_TAGS)[number];

export interface Enrichment {
  /** 1–3 sentences, in-universe. Written by the model. */
  bio: string;
  /** Short in-universe job title, or null when the source doesn't say. Written by the model. */
  occupation: string | null;
  roleTag: RoleTag;
  /**
   * Where the source text came from. Set from the fetch, never from the model — asking a model to
   * report its own source invites a plausible-looking URL that was never read.
   */
  sourceUrl: string;
  /** Which model generated this. Lets you find and re-generate everything from an older prompt. */
  modelVersion: string;
  /** ISO 8601. */
  generatedAt: string;
}

/**
 * What the cache holds. `unavailable` is not a failure to retry — it means we looked and there is
 * no usable source for this character. Without it, every view of an obscure character re-runs the
 * whole pipeline (fetch + model call) forever, at cost, to arrive at the same nothing.
 *
 * Transient failures (network, rate limit, model overload) are never stored — they'd freeze a
 * temporary outage into a cached "no".
 */
export type StoredEnrichment =
  | { status: 'ready'; data: Enrichment }
  | { status: 'unavailable'; reason: string; at: string };

/**
 * The seam between the enrichment logic and wherever the data physically lives.
 *
 * Everything above this line is storage-agnostic; swapping Redis for Postgres later means writing
 * one new implementation of this interface and changing nothing else.
 */
export interface EnrichmentStore {
  get(key: string): Promise<StoredEnrichment | null>;
  putReady(key: string, data: Enrichment): Promise<void>;
  /** `ttlSeconds` keeps a negative result from being permanent — sources get written over time. */
  putUnavailable(key: string, reason: string, ttlSeconds: number): Promise<void>;
}
