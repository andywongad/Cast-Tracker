import type { CastMember } from '../types';

/**
 * TVmaze in-character images, matched onto cast we already hold from TMDb.
 *
 * Scope note: only worth calling for scripted shows. TVmaze's /cast returns on-screen
 * personalities — for reality it's "Host", "Judge", "Narrator", never contestants — so a reality
 * lookup is a guaranteed miss. Callers gate on show.type === 'DRAMA'.
 */

export interface TvmazeCastEntry {
  character: string;
  characterImage: string | null;
  actor: string;
  tvmazeCharacterId: number | null;
}

export interface TvmazeResult {
  tvmazeId: number | null;
  showUrl?: string | null;
  cast: TvmazeCastEntry[];
}

/** Which source a cast member's displayed photo came from. Derived, never stored — see photoTier. */
export type PhotoTier = 'tvmaze-character' | 'tmdb-actor' | 'initials';

const TITLES = /\b(dr|mr|mrs|ms|miss|prof|professor|sir|dame|lord|lady|det|detective|officer|capt|captain|sgt|sergeant|lt|lieutenant|agent|father|sister|king|queen|prince|princess)\b\.?/g;

/**
 * Collapse a name to a comparable key: lowercase, drop parentheticals ("Jim Halpert (Season 1)"),
 * drop honorifics, strip punctuation and diacritics, squash whitespace.
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(TITLES, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Order-insensitive key. Handles "Smith, Dr." vs "Dr. Smith" once titles are stripped, and the
 * romanised-name reordering that's common in K-drama credits ("Sung Gi Hun" / "Gi Hun Sung").
 */
export function sortedKey(input: string | null | undefined): string {
  const n = normalizeName(input);
  return n ? n.split(' ').sort().join(' ') : '';
}

export interface MatchReport {
  matched: number;
  withImage: number;
  unmatchedLocal: string[];
  unmatchedRemote: string[];
}

/**
 * Match TVmaze entries onto local cast using character name AND actor name.
 *
 * Both signals are used because either alone is unreliable: character names diverge on titles and
 * romanisation, and actor names collide when one actor plays several roles. Passes run
 * strongest-first, and each entry is consumed once so a single TVmaze record can't be claimed by
 * two local members.
 */
export function matchCast(local: CastMember[], remote: TvmazeCastEntry[]): { images: Map<string, string>; report: MatchReport } {
  const images = new Map<string, string>();
  const takenRemote = new Set<number>();
  const matchedLocal = new Set<string>();

  const remoteKeys = remote.map((r) => ({
    charExact: normalizeName(r.character),
    charSorted: sortedKey(r.character),
    actorExact: normalizeName(r.actor),
    actorSorted: sortedKey(r.actor),
  }));

  const localKeys = local.map((c) => ({
    charExact: normalizeName(c.name),
    charSorted: sortedKey(c.name),
    actorExact: normalizeName(c.actorName),
    actorSorted: sortedKey(c.actorName),
  }));

  // Strongest first: both names agree, then character alone, then actor alone.
  const passes: ((li: number, ri: number) => boolean)[] = [
    (li, ri) => !!localKeys[li].charExact && localKeys[li].charExact === remoteKeys[ri].charExact
      && !!localKeys[li].actorExact && localKeys[li].actorExact === remoteKeys[ri].actorExact,
    (li, ri) => !!localKeys[li].charSorted && localKeys[li].charSorted === remoteKeys[ri].charSorted,
    (li, ri) => !!localKeys[li].actorSorted && localKeys[li].actorSorted === remoteKeys[ri].actorSorted,
  ];

  for (const pass of passes) {
    for (let li = 0; li < local.length; li++) {
      if (matchedLocal.has(local[li].id)) continue;
      for (let ri = 0; ri < remote.length; ri++) {
        if (takenRemote.has(ri)) continue;
        if (!pass(li, ri)) continue;
        matchedLocal.add(local[li].id);
        takenRemote.add(ri);
        if (remote[ri].characterImage) images.set(local[li].id, remote[ri].characterImage!);
        break;
      }
    }
  }

  return {
    images,
    report: {
      matched: matchedLocal.size,
      withImage: images.size,
      unmatchedLocal: local.filter((c) => !matchedLocal.has(c.id)).map((c) => c.name),
      unmatchedRemote: remote.filter((_, ri) => !takenRemote.has(ri)).map((r) => r.character || r.actor),
    },
  };
}

/**
 * Fallback chain: TVmaze character still, then the TMDb actor headshot we already had, then
 * initials. TVmaze's own person.image is deliberately not a tier — it's a second actor headshot
 * competing with TMDb's more complete one, so it adds a source without adding a kind of image.
 */
export function displayPhoto(c: Pick<CastMember, 'characterPhoto' | 'photo'>): string | null {
  // A photo the user cropped and uploaded themselves outranks everything — they chose it on
  // purpose. Uploads are data: URIs; anything fetched from TMDb is an https URL.
  if (c.photo?.startsWith('data:')) return c.photo;
  return c.characterPhoto || c.photo || null;
}

/** Derived rather than stored, so it can never disagree with the photo actually being shown. */
export function photoTier(c: Pick<CastMember, 'characterPhoto' | 'photo'>): PhotoTier {
  if (c.characterPhoto) return 'tvmaze-character';
  if (c.photo) return 'tmdb-actor';
  return 'initials';
}

export async function fetchTvmazeCast(tmdbId: number): Promise<TvmazeResult | null> {
  try {
    const res = await fetch(`/api/tvmaze?tmdbId=${encodeURIComponent(String(tmdbId))}`);
    if (!res.ok) return null;
    return (await res.json()) as TvmazeResult;
  } catch {
    // Additive feature: a failure here must leave today's behaviour untouched and silent.
    return null;
  }
}
