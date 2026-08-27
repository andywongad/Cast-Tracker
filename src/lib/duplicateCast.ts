import type { AppData, CastMember } from '../types';
import { isDisposable } from './castValue';

/**
 * Two records for one person, and how they become one.
 *
 * The cast-level twin of duplicateShows.ts, and it arrives by a different route. A show is
 * duplicated when two devices each *add* it before syncing. A cast member is duplicated even when
 * the show itself is shared: selecting an episode auto-loads everyone credited on it, and each
 * device mints its own local id for the same person. Those records are disposable, so nothing is
 * uploaded and nothing collides — until someone types into them. The moment a note is written on
 * the laptop and a nickname on the phone, two records that were always separate both become worth
 * syncing, and the account ends up holding one person twice.
 *
 * Observed exactly that way: one Jesse Pinkman carrying `whoTheyAre`, another carrying `nickname`,
 * same show, same actor, two ids. Neither device had lost anything; each was showing a different
 * record, and the person looking at them reasonably concluded sync was broken.
 *
 * Merged rather than offered as a choice. Two records for one actor inside one show are never
 * legitimately two people — unlike two copies of a show, where a choice is real — so there is
 * nothing to adjudicate and the answer is simply "both".
 */

/**
 * The record that survives, decided from data alone.
 *
 * This is the load-bearing property. Every device runs this independently, and the loser is
 * tombstoned; if two devices disagreed about which one that is, they would delete each other's
 * keeper and the person would vanish entirely. The smallest id wins because ids are strings both
 * devices already hold, and string order is the same everywhere — no clock, no arrival order, no
 * local state involved.
 */
function keeperOf(group: CastMember[]): CastMember {
  return [...group].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
}

const EMPTY = (v: unknown): boolean =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

/**
 * One record from several, field by field.
 *
 * A field only one record filled in is taken as it stands — the disjoint case, which is the common
 * one and the whole reason a merge beats last-write-wins here. Where two records both hold a value
 * for the same field, the newer `editedAt` wins, which is the rule the rest of sync already uses.
 *
 * Arrays are taken whole rather than concatenated. Unioning relationships or versions would need
 * an identity for each element and would silently double anything the two sides had in common;
 * taking the newer list is predictable, and the alternative is a merge nobody can predict.
 */
export function mergeCastRecords(group: CastMember[]): CastMember {
  const keeper = keeperOf(group);
  // Oldest first, so a later record's value overwrites an earlier one on any contested field.
  const byAge = [...group].sort((a, b) => (a.editedAt ?? 0) - (b.editedAt ?? 0));

  const merged: CastMember = { ...keeper };
  for (const record of byAge) {
    for (const [key, value] of Object.entries(record)) {
      if (key === 'id' || key === 'editedAt') continue;
      if (EMPTY(value)) continue;
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }

  merged.id = keeper.id;
  /**
   * The newest stamp among the sources, never `Date.now()`. A fresh timestamp would differ on each
   * device, so every sync would see the other's merge as newer, rewrite it, and hand back a record
   * that had changed again — a loop with no end state.
   */
  merged.editedAt = Math.max(...group.map((c) => c.editedAt ?? 0)) || undefined;
  /**
   * A merged record holds something a person wrote, by definition of how it came to exist. Leaving
   * `auto` set would let "clear auto-loaded characters" throw the merge away.
   *
   * Deleted rather than set false: the field is typed `true | undefined`, so absence is how this
   * app spells "not auto-loaded" and writing `false` would be a second spelling for it.
   */
  if (!isDisposable(merged)) delete merged.auto;

  return merged;
}

export interface CastDuplicate {
  showId: string;
  actorTmdbId: number;
  ids: string[];
}

/**
 * Every group of records that are the same person in the same show.
 *
 * Keyed on `actorTmdbId`, the only identity two devices independently agree on. Records without
 * one were typed by hand and have nothing to match on — two of those are as likely to be two
 * genuine characters as a duplicate, and guessing from names would merge a mother and daughter who
 * share one.
 */
export function findCastDuplicates(data: AppData): CastDuplicate[] {
  const found: CastDuplicate[] = [];
  for (const show of data.shows) {
    const byActor = new Map<number, CastMember[]>();
    for (const c of show.cast) {
      if (typeof c.actorTmdbId !== 'number') continue;
      const list = byActor.get(c.actorTmdbId);
      if (list) list.push(c);
      else byActor.set(c.actorTmdbId, [c]);
    }
    for (const [actorTmdbId, group] of byActor) {
      if (group.length > 1) found.push({ showId: show.id, actorTmdbId, ids: group.map((c) => c.id) });
    }
  }
  return found;
}

/**
 * Collapse every duplicate in place. Returns how many records were removed.
 *
 * Call inside a *stamped* `updateData`: dropping the losers is what writes their tombstones, and
 * without those the other device sends its copy straight back on the next sync.
 */
export function mergeDuplicateCast(data: AppData): number {
  let removed = 0;

  for (const show of data.shows) {
    const byActor = new Map<number, CastMember[]>();
    for (const c of show.cast) {
      if (typeof c.actorTmdbId !== 'number') continue;
      const list = byActor.get(c.actorTmdbId);
      if (list) list.push(c);
      else byActor.set(c.actorTmdbId, [c]);
    }

    const replacement = new Map<string, CastMember>();
    const drop = new Set<string>();
    for (const group of byActor.values()) {
      if (group.length < 2) continue;
      const merged = mergeCastRecords(group);
      replacement.set(merged.id, merged);
      for (const c of group) if (c.id !== merged.id) drop.add(c.id);
    }
    if (!replacement.size) continue;

    // Rebuilt in place so the merged record keeps the keeper's position in the grid rather than
    // jumping to the end, which would look like the card had moved for no reason.
    show.cast = show.cast
      .filter((c) => !drop.has(c.id))
      .map((c) => replacement.get(c.id) ?? c);
    removed += drop.size;
  }

  return removed;
}
