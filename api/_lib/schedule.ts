import { kv } from '@vercel/kv';
import { json, resolveTvmazeShow, TVMAZE } from './tvmaze-id.js';

/**
 * When a show's episodes actually air, to the minute.
 *
 * The cron used to work from TMDb's `last_episode_to_air.air_date`, which is a *date* — no time,
 * no zone, and only for an episode that has already gone out. That is enough to say "something
 * aired recently" and cannot say anything about a lead time, which is why "30 minutes before" was
 * a promise the UI made and the server could not keep.
 *
 * TVmaze carries `airstamp`, a real ISO timestamp with an offset, and an embeddable next episode.
 * That is the whole reason for the id chain — see _lib/tvmaze-id.ts.
 *
 * TMDb remains the fallback, because plenty of shows are not in TVmaze at all. Those keep exactly
 * the old behaviour: a date, read as midnight UTC, reported after the fact. `exact` says which
 * kind of answer this is, so callers can word a notification honestly rather than telling someone
 * a show "airs in 20 minutes" on the strength of a guessed midnight.
 */

export interface ScheduledEpisode {
  /** Source-prefixed, because TVmaze and TMDb episode ids share a keyspace in `sent:` otherwise. */
  key: string;
  season: number | null;
  number: number | null;
  name: string | null;
  /** Epoch ms. */
  airsAt: number;
  /** True when this came from a real timestamp rather than a date read as midnight UTC. */
  exact: boolean;
}

export interface ShowSchedule {
  title: string;
  /** Soonest-relevant first: the upcoming episode, then the one that just aired. */
  episodes: ScheduledEpisode[];
}

/** A TVmaze id, once found, is permanent. The negative answer is not, so it is kept briefly. */
const ID_TTL_SECONDS = 60 * 60 * 24 * 30;
const NO_MATCH_TTL_SECONDS = 60 * 60 * 24;

/**
 * Resolving costs three upstream calls and the cron now runs many times a day rather than once,
 * so the id is cached. `0` is the recorded "no TVmaze match" — distinguishable from a cache miss,
 * which is what stops a show that will never resolve from paying the full chain every run.
 */
async function tvmazeIdFor(tmdbId: number, tmdbKey: string): Promise<number | null> {
  const cached = await kv.get(`tvmaze:${tmdbId}`);
  if (typeof cached === 'number') return cached === 0 ? null : cached;

  const { show, reason } = await resolveTvmazeShow(tmdbId, tmdbKey);
  if (!show?.id) {
    // A TMDb outage is not evidence that a show is missing from TVmaze; don't cache that as one.
    if (reason !== 'tmdb-lookup-failed') await kv.set(`tvmaze:${tmdbId}`, 0, { ex: NO_MATCH_TTL_SECONDS });
    return null;
  }
  await kv.set(`tvmaze:${tmdbId}`, show.id, { ex: ID_TTL_SECONDS });
  return show.id;
}

function fromTvmaze(ep: any, exact = true): ScheduledEpisode | null {
  if (!ep?.id || !ep.airstamp) return null;
  const airsAt = Date.parse(ep.airstamp);
  if (Number.isNaN(airsAt)) return null;
  return {
    key: `tvmaze:${ep.id}`,
    season: ep.season ?? null,
    number: ep.number ?? null,
    name: ep.name || null,
    airsAt,
    exact,
  };
}

/**
 * What this show could reasonably notify about right now: the next episode, and the last one.
 *
 * Both, because the two lead-time cases need different episodes. Someone asking to be told an hour
 * before needs the upcoming one; someone asking to be told at the time of the episode is served by
 * either, depending on which side of the airstamp the run lands on. The caller decides — this only
 * reports what exists.
 */
export async function scheduleFor(tmdbId: number, tmdbKey: string): Promise<ShowSchedule | null> {
  const tvmazeId = await tvmazeIdFor(tmdbId, tmdbKey);

  if (tvmazeId) {
    const show = await json<any>(`${TVMAZE}/shows/${tvmazeId}?embed[]=nextepisode&embed[]=previousepisode`);
    if (show) {
      const next = fromTvmaze(show._embedded?.nextepisode);
      const prev = fromTvmaze(show._embedded?.previousepisode);
      return {
        title: show.name || 'A show you follow',
        episodes: [next, prev].filter((e): e is ScheduledEpisode => !!e),
      };
    }
  }

  // Fallback: exactly what this did before TVmaze, with the date read as midnight UTC and marked
  // inexact so nothing claims a precision it doesn't have.
  const data = await json<any>(
    `https://api.themoviedb.org/3/tv/${tmdbId}?${new URLSearchParams({ api_key: tmdbKey })}`,
  );
  if (!data) return null;

  const episodes: ScheduledEpisode[] = [];
  for (const raw of [data.next_episode_to_air, data.last_episode_to_air]) {
    if (!raw?.id || !raw.air_date) continue;
    const airsAt = Date.parse(`${raw.air_date}T00:00:00Z`);
    if (Number.isNaN(airsAt)) continue;
    episodes.push({
      key: `tmdb:${raw.id}`,
      season: raw.season_number ?? null,
      number: raw.episode_number ?? null,
      name: raw.name || null,
      airsAt,
      exact: false,
    });
  }

  return { title: data.name || 'A show you follow', episodes };
}
