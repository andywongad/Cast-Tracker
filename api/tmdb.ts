import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * TMDb proxy. The browser calls this instead of api.themoviedb.org so the API key stays on the
 * server — a VITE_-prefixed key is inlined into the client bundle and can be lifted by anyone
 * who opens devtools.
 *
 * Paths are allowlisted rather than forwarded blindly. Without that this becomes an open relay:
 * anyone could point it at any TMDb endpoint and spend your quota, and TMDb would see the abuse
 * as coming from you.
 */

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB = 'https://api.themoviedb.org/3';

/** Exactly the endpoints src/lib/tmdb.ts calls — nothing else gets through. */
const ALLOWED: RegExp[] = [
  /^\/search\/tv$/,
  /^\/tv\/\d+$/,
  /^\/tv\/\d+\/season\/\d+$/,
  // Per-season cast totals. Nothing calls this today — the season ranges it fed were taken off
  // the cast cards — but it's left allowlisted so bringing them back is a client-side change
  // rather than another deploy.
  /^\/tv\/\d+\/season\/\d+\/aggregate_credits$/,
  /^\/tv\/\d+\/season\/\d+\/episode\/\d+\/credits$/,
  /^\/tv\/\d+\/aggregate_credits$/,
  /^\/tv\/\d+\/watch\/providers$/,
  /^\/person\/\d+\/combined_credits$/,
  /^\/person\/\d+\/external_ids$/,
];

/** Query params we forward. Anything else is dropped so callers can't smuggle in their own api_key. */
const FORWARDED = new Set(['query', 'append_to_response', 'language', 'page']);

const HOUR = 3600;
const DAY = 86_400;
const WEEK = 604_800;
const MONTH = 2_592_000;

/** A season with nothing new for this long is over, and its episode list will not change again. */
const SETTLED_AFTER_MS = 30 * DAY * 1000;

const control = (fresh: number, stale: number) => `s-maxage=${fresh}, stale-while-revalidate=${stale}`;

/**
 * How long the edge may serve a response, decided per path.
 *
 * Everything used to get one hour. That is the right answer for exactly two of these endpoints and
 * far too cautious for the rest: the credits of an episode that aired in 2003 are not going to
 * change, and re-validating them hourly spends a function invocation to learn that nothing
 * happened. The edge cache is shared across all users, so a longer window here is the difference
 * between one origin fetch per hour and one per week for the paths that dominate the volume.
 *
 * `stale-while-revalidate` means nobody ever waits on the revalidation — the stale copy is served
 * immediately and refreshed behind the request — so the cost of being wrong is showing data that
 * is a little old, never a slow screen.
 *
 * Takes the body because two of these can only be judged by what came back.
 */
export function cacheControl(path: string, body: string): string {
  // Freshness matters more than caching. Search is what someone types to find a brand-new show,
  // and `/tv/{id}` carries `last_episode_to_air` — the field the nightly cron reads to decide
  // whether to notify anyone. Cache that for a day and notifications arrive a day late.
  if (path === '/search/tv') return control(600, DAY);
  if (/^\/tv\/\d+$/.test(path)) return control(HOUR, DAY);

  // A season's episode list grows while the show is airing and is fixed forever afterwards. Which
  // one this is can be read straight off the payload, so a finished season gets a week and a
  // currently-airing one keeps the cautious hour. Guessing from the season number would be wrong
  // for every revival and every long-running procedural.
  if (/^\/tv\/\d+\/season\/\d+$/.test(path)) {
    try {
      const { episodes } = JSON.parse(body) as { episodes?: { air_date?: string }[] };
      const latest = (episodes ?? [])
        .map((e) => (e.air_date ? Date.parse(`${e.air_date}T00:00:00Z`) : NaN))
        .filter((t) => !Number.isNaN(t))
        .reduce((a, b) => Math.max(a, b), 0);
      if (latest && Date.now() - latest > SETTLED_AFTER_MS) return control(WEEK, MONTH);
    } catch {
      // Unparseable body: fall through to the cautious answer rather than guessing.
    }
    return control(HOUR, DAY);
  }

  // Credits settle once an episode has actually aired. Before that TMDb often has the episode but
  // nobody has filled in who is in it, and pinning an empty cast for a day would quietly break the
  // auto-load on exactly the shows people are watching week to week — so an empty answer is
  // treated as "not ready yet", not as "this episode has no cast".
  if (/\/credits$/.test(path) || /aggregate_credits$/.test(path)) {
    try {
      const c = JSON.parse(body) as { cast?: unknown[]; guest_stars?: unknown[] };
      if (!(c.cast?.length || c.guest_stars?.length)) return control(HOUR, DAY);
    } catch {
      return control(HOUR, DAY);
    }
    return control(DAY, WEEK);
  }

  // Which services carry a show changes on licensing deals, not on a schedule — days apart at the
  // fastest, and never in a way anyone is watching for. A day fresh, a week stale, and the card
  // links out to JustWatch's live page for anyone who needs the truth this minute.
  if (/\/watch\/providers$/.test(path)) return control(DAY, WEEK);

  // Person lookups. A filmography gains a credit now and then; nothing here is time-critical.
  return control(DAY, WEEK);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!TMDB_API_KEY) {
    // Misconfiguration, not a client error — say so plainly in the logs.
    console.error('TMDB_API_KEY is not set; /api/tmdb cannot serve requests');
    return res.status(503).json({ error: 'TMDb is not configured' });
  }

  const path = typeof req.query.path === 'string' ? req.query.path : '';
  if (!ALLOWED.some((re) => re.test(path))) {
    return res.status(400).json({ error: 'Unsupported path' });
  }

  const qs = new URLSearchParams({ api_key: TMDB_API_KEY });
  for (const [k, v] of Object.entries(req.query)) {
    if (k === 'path' || !FORWARDED.has(k)) continue;
    qs.set(k, Array.isArray(v) ? v[0] : String(v));
  }

  try {
    const upstream = await fetch(`${TMDB}${path}?${qs.toString()}`);
    const body = await upstream.text();

    if (!upstream.ok) {
      // Don't pass TMDb's error body through — it can echo the key back in some responses.
      return res.status(upstream.status).json({ error: 'TMDb request failed' });
    }

    // The edge cache is shared by every user, so this is the whole cross-user caching story: a
    // second person opening the same show is served from it and never reaches this function.
    res.setHeader('Cache-Control', cacheControl(path, body));
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).send(body);
  } catch (err) {
    console.error('TMDb proxy error', err);
    return res.status(502).json({ error: 'Upstream unavailable' });
  }
}
