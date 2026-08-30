import type { CastMember } from '../types';
import type { AggregateCastMember, EpisodeCastMember } from './tmdb';
import { epNumFromLabel, colorForIndex } from './utils';

/**
 * Who TMDb credits in one episode, and which of them you haven't added yet.
 *
 * The show screen used to answer this only when you pressed an import button, and answering it
 * meant writing every one of those people into your saved cast — 34 records for a single Sopranos
 * episode. Selecting an episode now shows them instead, un-added ones as placeholder cards, and
 * nothing is written until you tap one.
 *
 * ## Where the list comes from
 *
 * The per-episode credits endpoint, which bills regulars and guests together and is the only
 * source that is actually about *this* episode. The cheaper option was the season payload's guest
 * stars plus the show's core cast, costing no extra request — but core cast is a threshold over
 * the whole series, and on The Sopranos it returns 32 people against the 11 regulars TMDb credits
 * on S3E4. Placeholders for people who aren't in the episode would make the feature a liar, so
 * this pays one request per episode selection instead, cached in memory and at the edge.
 */

/** A person credited in an episode, in the one shape both TMDb sources reduce to. */
export interface EpisodePerson {
  id: number;
  actorName: string;
  character: string;
  photo: string | null;
}

/** What this person is called on a card: the character for scripted, the person for reality. */
export function personLabel(p: EpisodePerson, isDrama: boolean): string {
  return isDrama && p.character ? p.character : p.actorName;
}

export function toEpisodePeople(credits: (EpisodeCastMember | AggregateCastMember)[]): EpisodePerson[] {
  const out: EpisodePerson[] = [];
  const seen = new Set<number>();
  for (const r of credits) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, actorName: r.name, character: r.character, photo: r.photo });
  }
  return out;
}

/**
 * Which of these people aren't in your cast yet.
 *
 * Matched on actorTmdbId first and the displayed name second, mirroring how the bulk import
 * decides whether someone is already there — otherwise a character added by hand, or added before
 * TMDb ids were recorded, would show up as a placeholder alongside the card that already exists.
 */
export function missingFromCast(
  people: EpisodePerson[],
  cast: CastMember[],
  isDrama: boolean,
): EpisodePerson[] {
  const ids = new Set(cast.map((c) => c.actorTmdbId).filter((n): n is number => !!n));
  const names = new Set(cast.map((c) => c.name));
  return people.filter((p) => !ids.has(p.id) && !names.has(personLabel(p, isDrama)));
}

/** A new cast record for someone picked out of an episode. */
export function personToCastMember(
  p: EpisodePerson,
  opts: { isDrama: boolean; season: number; episode: number; castLength: number; auto?: boolean },
): CastMember {
  return {
    // Provenance, so a record nobody chose and nobody has edited can be cleared later.
    ...(opts.auto ? { auto: true as const } : {}),
    id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6),
    color: colorForIndex(opts.castLength),
    // The position it is being appended to. For an auto-load that is TMDb's billing order, which
    // is what puts the leads at the top; two devices loading the same episode agree on it.
    order: opts.castLength,
    name: personLabel(p, opts.isDrama),
    native: '', nickname: '', otherNames: [], desc: '', photo: p.photo || null, notes: '',
    gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: 'Instagram',
    firstEp: `Ep ${opts.episode}`, season: opts.season,
    actorName: opts.isDrama ? p.actorName : '',
    actorTmdbId: p.id || null,
    wikiUrl: '', imdbUrl: '', versions: [], relationships: [],
  };
}

/**
 * Would `addPeopleToShow` change anything for this episode?
 *
 * Needed because the caller has to hand over the episode's *whole* cast, not just the people
 * missing from it — the low-water-mark below only reaches records that are already there. Passing
 * the whole list means most selections have nothing to do, and `updateData` clones and re-persists
 * the entire store whether or not the callback touches it, so it's worth asking first.
 */
export function episodeChangesAnything(
  cast: CastMember[],
  people: EpisodePerson[],
  opts: { isDrama: boolean; season: number; episode: number },
): boolean {
  for (const p of people) {
    const name = personLabel(p, opts.isDrama);
    if (!name) continue;
    const existing = cast.find((c) => (p.id && c.actorTmdbId === p.id) || c.name === name);
    if (!existing) return true;
    if (existing.firstEpPinned) continue;
    if (isEarlierThan(existing, opts)) return true;
  }
  return false;
}

/** Is `at` before where this record currently says the character was first seen? */
function isEarlierThan(c: CastMember, at: { season: number; episode: number }): boolean {
  const knownSeason = c.season || 1;
  // No recorded episode means unknown, so anything beats it. epNumFromLabel returns 1 for an
  // unparseable label, which would read as "episode 1" and block every correction.
  const knownEp = c.firstEp ? epNumFromLabel(c.firstEp) : Infinity;
  return at.season < knownSeason || (at.season === knownSeason && at.episode < knownEp);
}

/**
 * Add these people to a show, in place, inside an updateData callback.
 *
 * Shared by the placeholder cards and the add-all action so the two can't drift on how a record
 * is stamped. Someone already present keeps the *earliest* episode they've been seen in — an
 * import from further back moves them earlier, which is what stops one import from season 5
 * stamping the whole cast season 5 and emptying the seasons before it.
 */
export function addPeopleToShow(
  show: { cast: CastMember[] },
  people: EpisodePerson[],
  opts: { isDrama: boolean; season: number; episode: number; auto?: boolean },
) {
  for (const p of people) {
    const name = personLabel(p, opts.isDrama);
    if (!name) continue;

    const existing = show.cast.find((c) => (p.id && c.actorTmdbId === p.id) || c.name === name);
    if (existing) {
      /**
       * A first appearance the user set is theirs, not the import's to move.
       *
       * Without this the feature erased itself on first use: TMDb credits all eighteen Single's
       * Inferno people on every episode of a season, so setting a contestant to "first appears in
       * Ep 7" and then opening Ep 1 restamped them Ep 1 and showed them from the start again —
       * exactly the spoiler the setting exists to prevent. Season moves with it, since the two
       * together are the position.
       */
      if (existing.firstEpPinned) continue;
      if (isEarlierThan(existing, opts)) {
        existing.season = opts.season;
        existing.firstEp = `Ep ${opts.episode}`;
      }
      continue;
    }

    show.cast.push(personToCastMember(p, { ...opts, castLength: show.cast.length }));
  }
}

/**
 * The earliest point in the show where we have any evidence of this character.
 *
 * Two sources, and they answer slightly different questions. The stored `season`/`firstEp` is
 * where *you* met them — stamped when they were added and pulled earlier by the low-water-mark
 * rule as you work backwards. The first-season map is where TMDb says they actually debut, which
 * is more accurate but only accurate to a season.
 *
 * Take the earlier season either one knows about. Trust the stored episode only when the stored
 * season is the one that won, since an episode number from a different season means nothing.
 */
export function metPosition(
  c: CastMember,
  firstSeasons: Record<number, number> | null,
): { season: number; episode: number } {
  const storedSeason = c.season || 1;
  const tmdbSeason = (c.actorTmdbId && firstSeasons?.[c.actorTmdbId]) || Infinity;
  const season = Math.min(storedSeason, tmdbSeason);
  const episode = season === storedSeason && c.firstEp ? epNumFromLabel(c.firstEp) : 1;
  return { season, episode };
}

/** True when `c` was first seen at or before the given point in the show. */
export function metBy(
  c: CastMember,
  at: { season: number; episode: number },
  firstSeasons: Record<number, number> | null,
): boolean {
  const p = metPosition(c, firstSeasons);
  return p.season < at.season || (p.season === at.season && p.episode <= at.episode);
}
