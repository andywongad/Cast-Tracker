import { useEffect, useState } from 'react';
import { getSeasonCastIds } from './tmdb';

/**
 * Which season each actor first appears in, from TMDb.
 *
 * ## Why this exists
 *
 * `CastMember.season` records the season you were *looking at when you imported someone*, not
 * where they appear. The cast grid filtered on it as though it meant first appearance, so on a
 * scripted show it was answering "who did I happen to import at or before season N" — a question
 * about your import history, not about the show. Importing The Sopranos from season 3 stamped all
 * forty characters season 3, so season 1 matched nobody and rendered a blank page; importing a
 * K-drama from season 1 stamped everyone season 1, so every season looked identical.
 *
 * Nothing in the stored data could fix that, because first appearance was never recorded. This
 * derives it instead, and deliberately keeps it *outside* the saved shows: it's a cache of facts
 * about a TV show, not of anything the user typed, so `ct.v2` is untouched and no migration is
 * needed. Delete this key and the app recomputes it.
 *
 * ## Why per-season aggregate_credits
 *
 * The series-level `aggregate_credits` we already fetch has episode counts but no season identity
 * whatsoever, so it cannot answer this. `/tv/{id}/season/{n}/aggregate_credits` returns everyone
 * credited in that season, regulars and guests together; folding seasons in ascending order and
 * keeping the first sighting of each actor gives first appearance directly.
 *
 * ## Cost
 *
 * One request per season, once per show, then cached here forever — season casts don't change.
 * Only scripted shows need it: reality casts are disjoint per season and are imported a season at
 * a time, so their stored `season` really does mean what the filter wants. Across the sample
 * library that's 6 requests for The Sopranos, 25 for Law & Order, 1 for a K-drama, and nothing at
 * all for Survivor's 50 seasons.
 *
 * ## Accuracy
 *
 * Bounded by TMDb's season credits. Verified against The Sopranos: all 36 matched cast resolved,
 * Tony Soprano to season 1 and Ralph Cifaretto to season 3, which is right. Where TMDb credits
 * someone a season earlier than they truly appear, this shows them a season early — it errs
 * toward showing rather than hiding, which is the wrong direction for spoilers but the right one
 * for not making people vanish.
 */

const CACHE_KEY = 'ct.firstseason.v1';

/** Actor tmdb id → the earliest season they are credited in. */
export type FirstSeasonMap = Record<number, number>;

interface Entry {
  /** Which seasons were folded in. An ongoing show gaining a season refetches only the new ones. */
  covered: number[];
  first: FirstSeasonMap;
}

type Cache = Record<string, Entry>;

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') as Cache;
  } catch {
    return {};
  }
}

function saveCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // Storage full or unavailable. The map is a cache — losing it costs a refetch, nothing more.
  }
}

/** Run `jobs` with at most `width` in flight, so a 25-season show doesn't open 25 sockets at once. */
async function pool<T>(jobs: (() => Promise<T>)[], width: number): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(width, jobs.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= jobs.length) return;
        results[i] = await jobs[i]();
      }
    }),
  );
  return results;
}

/**
 * Resolves to `null` until the map is ready, which callers should read as "don't filter yet".
 * Showing the whole cast while this loads is the safe failure: hiding someone's entire cast for a
 * moment on first open reads as data loss, and the wait only happens once per show.
 */
export function useFirstSeasons(tmdbId: number | null, seasons: number[], enabled: boolean): FirstSeasonMap | null {
  const [map, setMap] = useState<FirstSeasonMap | null>(null);
  // Seasons arrive as a fresh array each render; compare by value so this doesn't refetch forever.
  const seasonKey = seasons.join(',');

  useEffect(() => {
    if (!enabled || !tmdbId || !seasons.length) { setMap(null); return; }

    let alive = true;
    const key = String(tmdbId);
    const cache = loadCache();
    const entry = cache[key];
    const wanted = [...seasons].sort((a, b) => a - b);
    const missing = wanted.filter((n) => !entry?.covered.includes(n));

    if (entry && !missing.length) { setMap(entry.first); return; }
    // Serve what's cached immediately, then fill the gaps. A show that gained a season shouldn't
    // drop back to unfiltered while one request runs.
    if (entry) setMap(entry.first);

    (async () => {
      const fetched = await pool(missing.map((n) => async () => ({ n, ids: await getSeasonCastIds(tmdbId, n) })), 4);
      if (!alive) return;

      const first: FirstSeasonMap = { ...(entry?.first || {}) };
      const covered = [...(entry?.covered || [])];
      // Ascending, so the first sighting of an actor is the earliest season they appear in.
      for (const { n, ids } of fetched.sort((a, b) => a.n - b.n)) {
        // A failed request leaves that season uncovered rather than recording a wrong answer;
        // it'll be retried next time the show is opened.
        if (!ids) continue;
        covered.push(n);
        for (const id of ids) if (first[id] === undefined || n < first[id]) first[id] = n;
      }

      const next: Entry = { covered: [...new Set(covered)].sort((a, b) => a - b), first };
      saveCache({ ...loadCache(), [key]: next });
      setMap(next.first);
    })();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmdbId, seasonKey, enabled]);

  return map;
}
