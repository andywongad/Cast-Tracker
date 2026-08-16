import type { CastMember } from '../types';

/**
 * Which cast records are the user's, and which are just TMDb passing through.
 *
 * Selecting an episode writes everyone credited on it into the show. That is what makes the
 * screen useful, and it also means a season of Law & Order can leave six hundred records behind
 * that the user never chose and cannot undo. On the sample library, 4 of 357 records contained
 * anything the user had typed; the other 353 were name, photo URL, actor id and an episode stamp.
 *
 * So rather than asking the user to curate, the app works out which records have anything of
 * theirs in them. Everything else is disposable: it can be cleared on request, left out of a
 * backup, and re-fetched from TMDb in one request whenever the episode is opened again.
 *
 * Deriving this from content rather than tracking a flag on every edit is deliberate. A flag
 * would have to be cleared in the character form, five inline editors, the notes field, the
 * cropper, the version panel and the relationship map — and the one call site somebody forgot
 * would silently throw away a user's work.
 */

/** Fields only a person fills in. `photo` is excluded: TMDb supplies one for nearly every record. */
const USER_AUTHORED = [
  'nickname', 'whoTheyAre', 'desc', 'notes', 'native',
  'age', 'hometown', 'occupation', 'social', 'gender',
] as const;

const USER_COLLECTIONS = ['otherNames', 'customFields', 'relationships', 'versions'] as const;

/** True when the user has put something of their own into this record. */
export function hasUserContent(c: CastMember): boolean {
  for (const f of USER_AUTHORED) {
    const v = c[f];
    if (typeof v === 'string' && v.trim() !== '') return true;
  }
  for (const f of USER_COLLECTIONS) {
    const v = c[f];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  // Reframing a photo, uploading one, or hiding someone from the map are all deliberate acts.
  if (c.photoCrop) return true;
  if (c.hideFromMap) return true;
  if (typeof c.photo === 'string' && c.photo.startsWith('data:')) return true;
  return false;
}

/**
 * True when this record was loaded automatically and still holds nothing of the user's, so
 * discarding it loses nothing that can't be fetched again.
 */
export function isDisposable(c: CastMember): boolean {
  return c.auto === true && !hasUserContent(c);
}

export function countDisposable(cast: CastMember[]): number {
  return cast.reduce((n, c) => n + (isDisposable(c) ? 1 : 0), 0);
}
