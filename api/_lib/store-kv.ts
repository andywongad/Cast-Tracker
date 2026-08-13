import { kv } from '@vercel/kv';
import type { Enrichment, EnrichmentStore, StoredEnrichment } from '../../src/lib/enrichment/types';

/**
 * Redis-backed implementation of EnrichmentStore.
 *
 * This is the only file that knows where enrichment physically lives. Swapping Redis for Postgres
 * later means writing one more file that satisfies the same interface — the key derivation, the
 * Wikipedia fetch, the Claude call and the handler all stay untouched.
 *
 * `@vercel/kv` picks up KV_REST_API_URL and KV_REST_API_TOKEN from the environment on its own;
 * there is no client to construct.
 *
 * Cache failures are deliberately non-fatal. If Redis is unreachable the feature should degrade to
 * "slow" — regenerate and serve — rather than to "broken". A cache is an optimization; treating an
 * outage in it as an outage in the feature turns a latency problem into a visible failure.
 */

/** Long enough that a missing article might get written; short enough to not be a life sentence. */
export const NO_SOURCE_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days
/** A refusal on fixed source text won't change on its own, so hold it longer. */
export const REFUSAL_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function isEnrichment(v: unknown): v is Enrichment {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.bio === 'string' && typeof e.sourceUrl === 'string' && typeof e.roleTag === 'string';
}

/**
 * Anything already in Redis was written by some earlier version of this code, so validate rather
 * than trust. A shape that no longer parses is treated as a miss — it regenerates, which is the
 * safe direction to fail.
 */
function coerce(raw: unknown): StoredEnrichment | null {
  if (raw == null) return null;

  // @vercel/kv deserializes JSON on read, but api/subscribe.ts writes pre-stringified values, so a
  // string can come back depending on who wrote the key. Handle both.
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;

  if (v.status === 'ready' && isEnrichment(v.data)) {
    return { status: 'ready', data: v.data };
  }
  if (v.status === 'unavailable' && typeof v.reason === 'string') {
    return { status: 'unavailable', reason: v.reason, at: typeof v.at === 'string' ? v.at : '' };
  }
  return null;
}

export const kvEnrichmentStore: EnrichmentStore = {
  async get(key) {
    try {
      return coerce(await kv.get<unknown>(key));
    } catch (err) {
      console.error('enrichment cache read failed', err);
      return null; // Treated as a miss — regenerate rather than fail the request.
    }
  },

  async putReady(key, data) {
    try {
      // No TTL: a generated bio is the durable artifact this whole feature exists to produce.
      await kv.set(key, { status: 'ready', data } satisfies StoredEnrichment);
    } catch (err) {
      console.error('enrichment cache write failed', err);
    }
  },

  async putUnavailable(key, reason, ttlSeconds) {
    try {
      await kv.set(
        key,
        { status: 'unavailable', reason, at: new Date().toISOString() } satisfies StoredEnrichment,
        { ex: ttlSeconds },
      );
    } catch (err) {
      console.error('enrichment negative-cache write failed', err);
    }
  },
};

/**
 * Per-IP daily cap on *generations*. Cache hits are free and uncapped; only the path that spends
 * money is counted.
 *
 * Without this, an unauthenticated endpoint that calls a paid API is an open invitation: a loop
 * over random show ids would bill every miss to you. This is a floor, not a fortress — it's keyed
 * on a spoofable header — but it turns "unbounded" into "annoying", which at this scale is enough.
 */
export async function underGenerationLimit(ip: string, maxPerDay: number): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:enrich:${day}:${ip}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, 60 * 60 * 24);
    return count <= maxPerDay;
  } catch (err) {
    // Fail open: a Redis blip shouldn't take the feature down. The blast radius is bounded by the
    // fact that generation is only reachable one character at a time.
    console.error('rate limit check failed', err);
    return true;
  }
}
