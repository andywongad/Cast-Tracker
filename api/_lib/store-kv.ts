import { kv } from '@vercel/kv';
import type { Enrichment, EnrichmentStore, StoredEnrichment } from '../../src/lib/enrichment/types.js';
import type { Recap, RecapStore, StoredRecap } from '../../src/lib/recap/types.js';
import type { FamilyTree, FamilyTreeStore, StoredFamilyTree } from '../../src/lib/familyTree/types.js';

/**
 * Redis-backed implementation of EnrichmentStore.
 *
 * This is the only file that knows where generated content physically lives — bios, recaps and
 * family trees alike. Swapping Redis for Postgres later means writing one more file that satisfies the same
 * interfaces — the key derivation, the source fetches, the Claude calls and the handlers all stay
 * untouched.
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

/**
 * A season whose episode summaries say too little to recap.
 *
 * Shorter than it could be because TMDb overviews are community-written and a currently-airing
 * season fills in over weeks — a season that was unrecappable in March is often fine by May.
 */
export const NO_RECAP_SOURCE_TTL_SECONDS = 60 * 60 * 24 * 3; // 3 days

/**
 * A show whose article never says how anyone is related.
 *
 * The longest of the three negative TTLs, because it is the most settled fact of the three: a
 * season's overviews fill in week by week as it airs, but an article that has no relationship
 * prose in it is describing a show that does not have a family tree to find — a procedural, a
 * panel show, an anthology — and that does not change on a fortnight's notice.
 */
export const NO_TREE_SOURCE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

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

function isRecap(v: unknown): v is Recap {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return typeof r.text === 'string' && Array.isArray(r.beats) && typeof r.throughEpisode === 'number';
}

/**
 * Anything already in Redis was written by an earlier version of this code, so validate rather
 * than trust. A shape that no longer parses is a miss, which regenerates — the safe direction.
 */
function coerceRecap(raw: unknown): StoredRecap | null {
  if (raw == null) return null;

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

  if (v.status === 'ready' && isRecap(v.data)) return { status: 'ready', data: v.data };
  if (v.status === 'unavailable' && typeof v.reason === 'string') {
    return { status: 'unavailable', reason: v.reason, at: typeof v.at === 'string' ? v.at : '' };
  }
  return null;
}

export const kvRecapStore: RecapStore = {
  async get(key) {
    try {
      return coerceRecap(await kv.get<unknown>(key));
    } catch (err) {
      console.error('recap cache read failed', err);
      return null; // Treated as a miss — regenerate rather than fail the request.
    }
  },

  async putReady(key, data) {
    try {
      /**
       * No TTL. A recap of episodes 1–6 of a season that finished airing in 2003 is finished too;
       * the episodes it covers cannot change. A currently-airing season is the same story, because
       * the key names the episode the recap stops at — a new episode is a new key, not an edit to
       * this one.
       */
      await kv.set(key, { status: 'ready', data } satisfies StoredRecap);
    } catch (err) {
      console.error('recap cache write failed', err);
    }
  },

  async putUnavailable(key, reason, ttlSeconds) {
    try {
      await kv.set(
        key,
        { status: 'unavailable', reason, at: new Date().toISOString() } satisfies StoredRecap,
        { ex: ttlSeconds },
      );
    } catch (err) {
      console.error('recap negative-cache write failed', err);
    }
  },
};

function isFamilyTree(v: unknown): v is FamilyTree {
  if (!v || typeof v !== 'object') return false;
  const t = v as Record<string, unknown>;
  return Array.isArray(t.edges) && Array.isArray(t.names) && typeof t.asOfEpisode === 'number';
}

/**
 * Anything already in Redis was written by an earlier version of this code, so validate rather
 * than trust. A shape that no longer parses is a miss, which regenerates — the safe direction.
 *
 * `names` matters more here than the other two stores' fields do: the edges are indices into it,
 * so a row that lost its cast list is not a degraded tree but a meaningless one.
 */
function coerceTree(raw: unknown): StoredFamilyTree | null {
  if (raw == null) return null;

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

  if (v.status === 'ready' && isFamilyTree(v.data)) return { status: 'ready', data: v.data };
  if (v.status === 'unavailable' && typeof v.reason === 'string') {
    return { status: 'unavailable', reason: v.reason, at: typeof v.at === 'string' ? v.at : '' };
  }
  return null;
}

export const kvTreeStore: FamilyTreeStore = {
  async get(key) {
    try {
      return coerceTree(await kv.get<unknown>(key));
    } catch (err) {
      console.error('tree cache read failed', err);
      return null; // Treated as a miss — regenerate rather than fail the request.
    }
  },

  async putReady(key, data) {
    try {
      /**
       * No TTL. The key names an episode, and what one episode established about who is whose
       * family is finished the moment it airs. A later episode that complicates it is a different
       * key, not an edit to this one — which is the same reason the recap store keeps its rows.
       */
      await kv.set(key, { status: 'ready', data } satisfies StoredFamilyTree);
    } catch (err) {
      console.error('tree cache write failed', err);
    }
  },

  async putUnavailable(key, reason, ttlSeconds) {
    try {
      await kv.set(
        key,
        { status: 'unavailable', reason, at: new Date().toISOString() } satisfies StoredFamilyTree,
        { ex: ttlSeconds },
      );
    } catch (err) {
      console.error('tree negative-cache write failed', err);
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
/**
 * A ceiling on generations for the whole deployment, not just one caller.
 *
 * The per-IP limit below stops one person burning the budget; it does not bound the bill, because
 * rotating source addresses is trivial and costs an attacker nothing. This does: whatever else
 * happens, the model is called at most `maxPerDay` times in a day, and the worst case is a bounded
 * number rather than an open tap on someone else's API key.
 *
 * Deliberately counted at the same moment as the per-IP check — after the cache has been consulted
 * — so repeat views of a character already generated cost nothing and never approach either limit.
 *
 * Fails open, like its neighbour. A Redis outage should degrade this feature to "slow", not take
 * the app down; the honest trade is that cost protection is unavailable for exactly as long as KV
 * is, which is visible in the logs below.
 *
 * `scope` keeps each kind of generation on its own counter. Recaps cost several times a bio, so a
 * shared ceiling would let a day of recaps starve the bios — and the two are capped at different
 * numbers precisely because they cost different amounts. The default preserves the key shape that
 * enrichment has been writing since before this parameter existed.
 */
export async function underGlobalGenerationLimit(maxPerDay: number, scope = 'enrich'): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${scope}:global:${day}`;
  try {
    const count = await kv.incr(key);
    if (count === 1) await kv.expire(key, 60 * 60 * 24);
    if (count > maxPerDay) console.warn(`${scope}: global daily cap reached (${count}/${maxPerDay})`);
    return count <= maxPerDay;
  } catch (err) {
    console.error('global rate limit check failed', err);
    return true;
  }
}

export async function underGenerationLimit(ip: string, maxPerDay: number, scope = 'enrich'): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${scope}:${day}:${ip}`;
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
