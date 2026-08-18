import { kv } from '@vercel/kv';

/**
 * Who wants telling about which show.
 *
 * The previous shape couldn't answer that question at all. A subscription was stored on its own,
 * the show it was for was never recorded, and the cron read `show:*` keys that nothing had ever
 * written — so it looped over an empty set and then, for good measure, called `kv.keys` again
 * inside the per-subscription loop.
 *
 * Sets, and no `keys()` anywhere. `KEYS` is O(N) over the whole keyspace and blocks the server;
 * it's the wrong tool for "list the things I already know I care about", and it gets slower for
 * everyone as the database fills with unrelated data (the enrichment cache lives here too).
 *
 *   sub:{endpoint}          the PushSubscription, as JSON
 *   sub:{endpoint}:shows    SET of TMDb ids this browser follows
 *   show:{tmdbId}:subs      SET of endpoints following this show
 *   shows:watched           SET of TMDb ids anyone follows — what the cron iterates
 *   sent:{tmdbId}:{epId}    SET of endpoints already told about this episode
 *
 * The two directions are both stored because both are needed: the cron walks shows to
 * subscribers, and unsubscribing walks a subscriber to their shows. Keeping them in step is the
 * price, which is why every write below touches both sides.
 */

/** A year. Refreshed on every resubscribe, so an active browser never expires. */
const SUB_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * Long enough that a retry or a manual run can't re-notify, short enough that the keyspace doesn't
 * grow forever. An episode is old news well before this.
 */
const SENT_TTL_SECONDS = 60 * 60 * 24 * 14;

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function isValidSubscription(v: unknown): v is PushSubscriptionJSON {
  if (!v || typeof v !== 'object') return false;
  const s = v as PushSubscriptionJSON;
  return (
    typeof s.endpoint === 'string' &&
    s.endpoint.startsWith('https://') &&
    !!s.keys &&
    typeof s.keys.p256dh === 'string' &&
    typeof s.keys.auth === 'string'
  );
}

/**
 * `kv.get` deserializes JSON on the way out, so a value stored with JSON.stringify comes back as
 * an object. The old code called JSON.parse on it anyway, which threw — and because the cron's
 * try/catch wrapped the entire loop rather than one iteration, a single subscription took the
 * whole run down with it.
 */
export async function getSubscription(endpoint: string): Promise<PushSubscriptionJSON | null> {
  const raw = await kv.get(`sub:${endpoint}`);
  if (!raw) return null;
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  return isValidSubscription(value) ? value : null;
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function follow(sub: PushSubscriptionJSON, tmdbId: number): Promise<void> {
  await Promise.all([
    kv.set(`sub:${sub.endpoint}`, JSON.stringify(sub), { ex: SUB_TTL_SECONDS }),
    kv.sadd(`sub:${sub.endpoint}:shows`, String(tmdbId)),
    kv.sadd(`show:${tmdbId}:subs`, sub.endpoint),
    kv.sadd('shows:watched', String(tmdbId)),
  ]);
  await kv.expire(`sub:${sub.endpoint}:shows`, SUB_TTL_SECONDS);
}

export async function unfollow(endpoint: string, tmdbId: number): Promise<void> {
  await Promise.all([
    kv.srem(`sub:${endpoint}:shows`, String(tmdbId)),
    kv.srem(`show:${tmdbId}:subs`, endpoint),
  ]);
  await pruneShowIfEmpty(tmdbId);
}

/** Drops a browser entirely — used when it unsubscribes, and when a push says it's gone. */
export async function forget(endpoint: string): Promise<void> {
  const shows = await kv.smembers(`sub:${endpoint}:shows`);
  await Promise.all((shows || []).map((id) => kv.srem(`show:${id}:subs`, endpoint)));
  await Promise.all([kv.del(`sub:${endpoint}`), kv.del(`sub:${endpoint}:shows`)]);
  await Promise.all((shows || []).map((id) => pruneShowIfEmpty(Number(id))));
}

/**
 * A show nobody follows is a TMDb request the cron would make for nothing, every day, forever.
 * Checked after every removal so the watched set stays the true work list.
 */
async function pruneShowIfEmpty(tmdbId: number): Promise<void> {
  const remaining = await kv.scard(`show:${tmdbId}:subs`);
  if (!remaining) {
    await Promise.all([kv.del(`show:${tmdbId}:subs`), kv.srem('shows:watched', String(tmdbId))]);
  }
}

export async function watchedShows(): Promise<number[]> {
  const ids = await kv.smembers('shows:watched');
  return (ids || []).map((s) => Number(s)).filter((n) => Number.isFinite(n) && n > 0);
}

export async function followersOf(tmdbId: number): Promise<string[]> {
  return (await kv.smembers(`show:${tmdbId}:subs`)) || [];
}

export async function followsShow(endpoint: string, tmdbId: number): Promise<boolean> {
  return (await kv.sismember(`show:${tmdbId}:subs`, endpoint)) === 1;
}

/**
 * Idempotency, per recipient rather than per episode.
 *
 * Marking the whole episode sent up front would silently drop everyone still unsent if the run
 * died halfway; marking it afterwards would re-notify everyone who already got it. Recording each
 * endpoint as it succeeds means a re-run resumes exactly where it stopped, which is the only
 * behaviour that's correct whether the previous run finished, timed out, or hit a rate limit.
 */
export async function alreadySent(tmdbId: number, episodeId: number, endpoint: string): Promise<boolean> {
  return (await kv.sismember(`sent:${tmdbId}:${episodeId}`, endpoint)) === 1;
}

export async function markSent(tmdbId: number, episodeId: number, endpoint: string): Promise<void> {
  const key = `sent:${tmdbId}:${episodeId}`;
  await kv.sadd(key, endpoint);
  await kv.expire(key, SENT_TTL_SECONDS);
}
