import type { VercelRequest, VercelResponse } from '@vercel/node';
import { castForPage, groupByTier, type PageCastMember } from '../../src/lib/showPage.js';
import type { AggregateCastMember } from '../../src/lib/tmdb.js';

/**
 * A public, crawlable page for one show: /show/1399.
 *
 * The app itself is invisible to a search engine and always will be. Everything a person puts into
 * Cast Tracker lives in their own browser, and every screen is rendered from that — so a crawler
 * arriving at "/" gets an empty shell, correctly, because there is nothing of anyone's to show it.
 * These pages are the other thing: facts about a show that are public wherever you read them, sent
 * as finished HTML so they can be read with no JavaScript, no account and no prior state.
 *
 * Deliberately not part of the React app. It shares no bundle, no router and no store with it —
 * only the TMDb types and the tier logic in src/lib/showPage.ts, which is where the parts worth
 * testing live. The SPA is untouched.
 *
 * TMDb is called directly with the server-side key, the way api/_lib/recap-source.ts does, rather
 * than through api/tmdb.ts: that proxy exists to keep the key away from a browser, and there is no
 * browser here. Going through it would add a hop and an allowlist to satisfy for nothing.
 */

const TMDB = 'https://api.themoviedb.org/3';
const SITE = 'https://casttracker.app';

/** Two sequential fetches share one budget; a slow one here is a crawler's timeout. */
const FETCH_TIMEOUT_MS = 8000;

/** Past this, it is not a TMDb id, it is someone probing. */
const MAX_TMDB_ID = 99_999_999;

/**
 * Everything on this page is someone else's text — a show's title, a character's name — going into
 * HTML. TMDb has titles with ampersands and quotes in them today, and nothing stops it having one
 * with a bracket tomorrow.
 */
function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** For a meta description or an og:title, where markup is not the risk but length is. */
function trim(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : flat.slice(0, max - 1).trimEnd() + '…';
}

async function tmdb<T>(path: string, apiKey: string): Promise<T | null> {
  const qs = new URLSearchParams({ api_key: apiKey });
  try {
    const res = await fetch(`${TMDB}${path}?${qs}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export interface ShowDetails {
  name?: string;
  overview?: string;
  poster_path?: string | null;
  first_air_date?: string;
  number_of_episodes?: number;
  number_of_seasons?: number;
}

/**
 * Exported so the rendered HTML can be parsed and checked without a deploy — Vercel uses only the
 * default export, so a named one costs nothing at runtime.
 */
export function page(id: number, show: ShowDetails, cast: PageCastMember[], credited: number): string {
  const truncated = credited > cast.length;
  const name = show.name || 'Untitled show';
  const year = (show.first_air_date || '').slice(0, 4);
  const seasons = show.number_of_seasons || 0;
  const episodes = show.number_of_episodes || 0;

  const title = `${name} Cast — Cast Tracker`;
  /**
   * The show's own blurb when it has one, and a description built from what we counted when it does
   * not. An empty description is worse than a plain one: it is what a search result shows.
   */
  const description = trim(
    show.overview
      || `Every character in ${name}${year ? ` (${year})` : ''}: ${cast.length} cast members, who plays them, and how much of the show each one is in.`,
    200,
  );
  const canonical = `${SITE}/show/${id}`;
  const ogImage = show.poster_path
    ? `https://image.tmdb.org/t/p/w780${show.poster_path}`
    : `${SITE}/og-image.png`;

  const stat = [
    year && `First aired ${year}`,
    seasons && `${seasons} season${seasons === 1 ? '' : 's'}`,
    episodes && `${episodes} episode${episodes === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  const row = (p: PageCastMember) => `
      <li class="p">
        ${p.photo ? `<img src="${esc(p.photo)}" alt="" width="56" height="56" loading="lazy" />` : '<span class="ph" aria-hidden="true"></span>'}
        <span class="who">
          <strong>${esc(p.character)}</strong>
          <span class="a">${esc(p.name)}</span>
          ${p.billing ? `<span class="b">${esc(p.billing)}</span>` : ''}
        </span>
      </li>`;
  const groups = groupByTier(cast).map((g) => `
  <h2>${esc(g.label)} · ${g.people.length}</h2>
  <ul>${g.people.map(row).join('')}\n  </ul>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<link rel="icon" type="image/png" href="/favicon-48.png" />
<style>
:root{--bg:#E8EDF3;--card:#fff;--text:#15293B;--muted:#4F6480;--faint:#556B84;--cta:#C1462E;--border:#D2DCE8}
@media(prefers-color-scheme:dark){:root{--bg:#0B1926;--card:#122433;--text:#E9EFF6;--muted:#9AAFC4;--faint:#8FA3B9;--cta:#E2664F;--border:#1D3346}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Inter,-apple-system,BlinkMacFontSystem,'Segoe UI',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.w{max-width:860px;margin:0 auto;padding:28px 20px 60px}
header{display:flex;gap:18px;align-items:flex-start;margin-bottom:8px}
header img{width:120px;height:180px;object-fit:cover;border-radius:12px;flex:none;background:var(--border)}
h1{font-size:28px;line-height:1.2;margin:0 0 6px}
.stat{color:var(--faint);font-size:14px;margin:0 0 12px}
.ov{color:var(--muted);font-size:15px;margin:0 0 16px;max-width:60ch}
.cta{display:inline-block;background:var(--cta);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:11px 18px;border-radius:12px}
h2{font-size:15px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:32px 0 12px}
ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}
.p{display:flex;gap:12px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:14px;padding:10px}
.p img,.ph{width:56px;height:56px;border-radius:10px;object-fit:cover;flex:none;background:var(--border)}
.who{min-width:0}
.who strong{display:block;font-size:15px}
.a{display:block;color:var(--muted);font-size:13.5px}
.b{display:block;color:var(--faint);font-size:12.5px;margin-top:2px}
.note{color:var(--faint);font-size:13px;margin-top:14px}
footer{margin-top:40px;color:var(--faint);font-size:13px}
footer a{color:inherit}
</style>
</head>
<body>
<div class="w">
<header>
  ${show.poster_path ? `<img src="https://image.tmdb.org/t/p/w342${esc(show.poster_path)}" alt="${esc(name)} poster" width="120" height="180" />` : ''}
  <div>
    <h1>${esc(name)} cast</h1>
    ${stat ? `<p class="stat">${esc(stat)}</p>` : ''}
    ${show.overview ? `<p class="ov">${esc(trim(show.overview, 320))}</p>` : ''}
    <a class="cta" href="/?add=${id}">Open in Cast Tracker</a>
  </div>
</header>

${cast.length ? groups : '<p class="ov">TMDb lists no cast for this show yet.</p>'}
${truncated ? `<p class="note">Showing the ${cast.length} most-present of ${credited} credited roles.</p>` : ''}

<footer>
  <p>Track who&rsquo;s who while you watch — <a href="/">Cast Tracker</a> keeps your notes on your own device.</p>
  <p>Show and cast data from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
</footer>
</div>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('Method not allowed');
  }

  const raw = Array.isArray(req.query.tmdbId) ? req.query.tmdbId[0] : req.query.tmdbId;
  const id = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isInteger(id) || id <= 0 || id > MAX_TMDB_ID) {
    return res.status(404).send('Not found');
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.error('TMDB_API_KEY is not set; show pages cannot render');
    return res.status(503).send('Temporarily unavailable');
  }

  const [show, credits] = await Promise.all([
    tmdb<ShowDetails>(`/tv/${id}`, apiKey),
    tmdb<{ cast?: Array<{ id: number; name: string; profile_path?: string | null; total_episode_count?: number; roles?: Array<{ character?: string }> }> }>(`/tv/${id}/aggregate_credits`, apiKey),
  ]);

  /**
   * A show TMDb does not have is a 404, not an error page. Returning 200 with "sorry" is how a site
   * ends up with thousands of indexed empty pages — the one outcome this whole exercise is meant to
   * avoid.
   */
  if (!show || !show.name) return res.status(404).send('Not found');

  const aggregate: AggregateCastMember[] = (credits?.cast || []).map((p) => ({
    id: p.id,
    name: p.name,
    character: p.roles?.[0]?.character || '',
    characters: (p.roles || []).map((r) => r.character || '').filter(Boolean),
    photo: p.profile_path ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null,
    episodeCount: p.total_episode_count || 0,
  }));

  const cast = castForPage(aggregate, show.number_of_episodes || 0);

  /**
   * Cached hard at the edge. A cast list changes when a season airs, not when someone reloads, and
   * a crawler working through a sitemap should not wake a function — or spend a TMDb call — per
   * hit. Same shape as api/recap.ts.
   */
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).send(page(id, show, cast, aggregate.length));
}
