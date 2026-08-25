import type { AppData, Show } from '../types';
import { isDisposable } from './castValue';

/**
 * Two copies of one show, and what to do about them.
 *
 * A show's identity is a local id minted by whichever device added it, not its TMDb id. So a show
 * added on a phone and again on a laptop, before those devices ever synced, arrives at the account
 * as two unrelated records — and sync faithfully keeps both. It cannot happen once two devices
 * share an account, because then adding a show on one sends that same show to the other; it is a
 * first-sync problem, which is exactly when it is most confusing.
 *
 * The rule, and the reason for it: a copy nobody has typed into is not worth a question. It holds
 * nothing that isn't re-fetchable from TMDb, so removing it loses nothing, and asking about it
 * would be asking someone to adjudicate between a thing and a copy of that thing. Only when both
 * copies carry the user's own work is there a real decision, and then it is theirs to make.
 */

/**
 * Whether this copy holds anything the user typed.
 *
 * Reuses `isDisposable`, the same test that decides what a backup carries and what sync uploads —
 * so "worth keeping" means the same thing here as everywhere else in the app. Auto-loaded cast
 * doesn't count however much of it there is: sixty-one records fetched from TMDb are not work.
 */
export function keptCount(show: Show): number {
  return show.cast.reduce((n, c) => n + (isDisposable(c) ? 0 : 1), 0);
}

export interface DuplicateGroup {
  tmdbId: number;
  title: string;
  /** Every copy, richest first, so a caller offering a choice lists the likeliest keeper at the top. */
  shows: { id: string; title: string; kept: number; castTotal: number }[];
}

/** Groups of shows that are the same show. Shows with no TMDb id are never grouped: nothing identifies them. */
export function findDuplicateGroups(data: AppData): DuplicateGroup[] {
  const byTmdb = new Map<number, Show[]>();
  for (const s of data.shows) {
    if (typeof s.tmdbId !== 'number' || !s.tmdbId) continue;
    const list = byTmdb.get(s.tmdbId);
    if (list) list.push(s);
    else byTmdb.set(s.tmdbId, [s]);
  }

  const groups: DuplicateGroup[] = [];
  for (const [tmdbId, shows] of byTmdb) {
    if (shows.length < 2) continue;
    const described = shows
      .map((s) => ({ id: s.id, title: s.title, kept: keptCount(s), castTotal: s.cast.length }))
      .sort((a, b) => b.kept - a.kept || b.castTotal - a.castTotal || a.id.localeCompare(b.id));
    groups.push({ tmdbId, title: described[0].title, shows: described });
  }
  return groups;
}

/**
 * What to do with one group, or null when the user has to decide.
 *
 * Null means two or more copies carry the user's own records. Everything else resolves here: one
 * copy with work keeps it, and a tie of empty copies is settled by cast count then id, which is
 * arbitrary but deterministic — two devices resolving the same group independently must reach the
 * same answer, or they will delete each other's keeper.
 */
export function planResolution(group: DuplicateGroup): { keepId: string; dropIds: string[] } | null {
  const withWork = group.shows.filter((s) => s.kept > 0);
  if (withWork.length > 1) return null;
  const keep = withWork[0] ?? group.shows[0];
  return { keepId: keep.id, dropIds: group.shows.filter((s) => s.id !== keep.id).map((s) => s.id) };
}

/**
 * Drops the redundant copies, in place.
 *
 * Deletion rather than anything cleverer: every dropped copy is empty by the time this runs, so
 * there is nothing to carry across. Removing the show from `data.shows` is all that's needed —
 * `stampEdits` turns a vanished show into a tombstone on the next save, which is what removes it
 * from the other devices too.
 */
export function applyResolutions(data: AppData): { removed: number; needsChoice: DuplicateGroup[] } {
  const needsChoice: DuplicateGroup[] = [];
  const drop = new Set<string>();

  for (const group of findDuplicateGroups(data)) {
    const plan = planResolution(group);
    if (!plan) { needsChoice.push(group); continue; }
    for (const id of plan.dropIds) drop.add(id);
  }

  if (drop.size) data.shows = data.shows.filter((s) => !drop.has(s.id));
  return { removed: drop.size, needsChoice };
}

/**
 * Folds every other copy's user-authored records into `keepId`, then drops the empties.
 *
 * For the case the user was asked about. Auto-loaded records are left behind deliberately: they
 * would double the cast list with duplicates of people already there, and they come back from TMDb
 * on their own. A record moving to another show keeps its own id — sync keys rows by show *and*
 * record, so the move reads as a delete from one show and a write to the other, which is what it is.
 */
export function mergeGroup(data: AppData, tmdbId: number, keepId: string): void {
  const keeper = data.shows.find((s) => s.id === keepId);
  if (!keeper) return;

  const others = data.shows.filter((s) => s.id !== keepId && s.tmdbId === tmdbId);
  const present = new Set(keeper.cast.map((c) => c.id));

  for (const other of others) {
    for (const c of other.cast) {
      if (isDisposable(c) || present.has(c.id)) continue;
      keeper.cast.push(c);
      present.add(c.id);
    }
  }

  const gone = new Set(others.map((s) => s.id));
  data.shows = data.shows.filter((s) => !gone.has(s.id));
}
