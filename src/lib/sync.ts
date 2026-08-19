import { getSupabase } from './supabase';
import { hasUserContent } from './castValue';
import type { AppData, CastMember, Show } from '../types';

/**
 * Cross-device sync: what to send, what to keep, and who wins.
 *
 * The conflict rule is per-record last-write-wins, decided by `editedAt` — the same shape Figma
 * uses, resolved per object rather than per document, one notch coarser because the realistic
 * conflict here is "I edited this character on my phone", not "we both touched the nickname at
 * once". Whole-library last-write-wins was rejected: it silently destroys whatever was done on
 * the device that happens to sync first.
 *
 * Only records holding something the user typed are sent. Auto-loaded cast regenerates from TMDb
 * on any device, so uploading it would be replicating a cache — on the sample library that was 4
 * records worth keeping out of 357.
 */

const CURSOR_KEY = 'ct.sync.v1';
const TOMBSTONE_KEY = 'ct.sync.tombstones.v1';

/** A record that existed here and was deleted, remembered until the deletion has been sent. */
export interface Tombstone {
  showId: string;
  /** Null means the show itself was deleted, not one of its cast. */
  recordId: string | null;
  deletedAt: number;
}

interface Cursor {
  userId: string;
  /** `server_at` of the newest row already pulled, as returned by Postgres. */
  serverAt: string;
}

function readCursor(): Cursor | null {
  try {
    const raw = localStorage.getItem(CURSOR_KEY);
    return raw ? (JSON.parse(raw) as Cursor) : null;
  } catch {
    return null;
  }
}

/**
 * The cursor is per user. Signing in as someone else on a shared device must not resume from the
 * previous account's high-water mark, which would silently skip every row written before it.
 */
export function cursorFor(userId: string): string {
  const c = readCursor();
  return c && c.userId === userId ? c.serverAt : new Date(0).toISOString();
}

export function saveCursor(userId: string, serverAt: string) {
  try {
    localStorage.setItem(CURSOR_KEY, JSON.stringify({ userId, serverAt } satisfies Cursor));
  } catch {
    // A full quota shouldn't break sync; the cost is re-pulling rows we already have, which is
    // idempotent. Losing the cursor is recoverable, losing the records is not.
  }
}

export function readTombstones(): Tombstone[] {
  try {
    const raw = localStorage.getItem(TOMBSTONE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Tombstone[]) : [];
  } catch {
    return [];
  }
}

function writeTombstones(list: Tombstone[]) {
  try {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(list));
  } catch {
    /* see saveCursor */
  }
}

/**
 * Stamp every record that changed, and remember every record that vanished.
 *
 * Called from `updateData` with the state either side of an edit, so there is exactly one place
 * that has to be right. The alternative — setting `editedAt` at each edit site — would mean the
 * character form, five inline editors, the notes field, the cropper, the version panel and the
 * relationship map each remembering to do it, and the one that was forgotten would produce an edit
 * that saves locally and never syncs. That failure is invisible until someone opens their other
 * phone and finds their work missing, which is the worst possible time to discover it.
 *
 * Deletions are caught the same way. A local delete removes the record from the array, so nothing
 * downstream can tell "deleted here" from "not pulled yet" — and without that distinction, syncing
 * a device that still holds the record simply puts it back. Diffing the two states is what turns a
 * removal into a tombstone.
 *
 * Mutates `next` in place; it is already the fresh clone `updateData` made.
 */
export function stampEdits(prev: AppData, next: AppData, now = Date.now()): void {
  const prevShows = new Map(prev.shows.map((s) => [s.id, s]));
  const graves: Tombstone[] = [];

  for (const show of next.shows) {
    const before = prevShows.get(show.id);
    if (!before) {
      // Newly added here. Everything in it is this device's work as of now.
      show.editedAt = show.editedAt ?? now;
      for (const c of show.cast) c.editedAt = c.editedAt ?? now;
      continue;
    }

    if (showFieldsChanged(before, show)) show.editedAt = now;

    const prevCast = new Map(before.cast.map((c) => [c.id, c]));
    for (const c of show.cast) {
      const was = prevCast.get(c.id);
      if (!was) { c.editedAt = c.editedAt ?? now; continue; }
      if (recordChanged(was, c)) c.editedAt = now;
      prevCast.delete(c.id);
    }
    // Whatever is left in prevCast was in the previous state and isn't in this one.
    for (const gone of prevCast.values()) {
      // Only records that were worth syncing are worth tombstoning. An auto-loaded placeholder
      // being evicted is not a deletion anyone needs replicated — it reappears from TMDb.
      if (hasUserContent(gone)) graves.push({ showId: show.id, recordId: gone.id, deletedAt: now });
    }
    prevShows.delete(show.id);
  }

  for (const goneShow of prevShows.values()) {
    graves.push({ showId: goneShow.id, recordId: null, deletedAt: now });
  }

  if (graves.length) writeTombstones([...readTombstones(), ...graves]);
}

/** Compares everything except the stamp itself, which would otherwise make every record "changed". */
function recordChanged(a: CastMember, b: CastMember): boolean {
  return serialise(a) !== serialise(b);
}

function showFieldsChanged(a: Show, b: Show): boolean {
  // `cast` is excluded: cast members carry their own stamps, and including them here would mark
  // the show edited every time an episode auto-loaded a placeholder into it.
  return serialise({ ...a, cast: [] }) !== serialise({ ...b, cast: [] });
}

function serialise(v: CastMember | Show): string {
  return JSON.stringify(v, (k, val) => (k === 'editedAt' ? undefined : val));
}

/* -- network ---------------------------------------------------------------------------------- */

/** The lazily-loaded client. Both callers below are user-initiated, so the load is never on the
 *  critical path of first paint. */
async function requireClient() {
  const c = getSupabase();
  if (!c) throw new Error('Sync is not configured.');
  return c;
}

interface RemoteRow {
  show_id: string;
  record_id?: string;
  payload: Record<string, unknown>;
  edited_at: string;
  server_at: string;
  deleted_at: string | null;
}

/** What this device has that the server should know about. */
export function collectPush(data: AppData, userId: string) {
  const shows = data.shows.map((s) => ({
    user_id: userId,
    show_id: s.id,
    // Cast travels as its own rows, so the show payload carries only the show's own fields.
    payload: { ...s, cast: undefined },
    edited_at: new Date(s.editedAt ?? 0).toISOString(),
  }));

  const cast = data.shows.flatMap((s) =>
    s.cast.filter(hasUserContent).map((c) => ({
      user_id: userId,
      show_id: s.id,
      record_id: c.id,
      payload: c as unknown as Record<string, unknown>,
      edited_at: new Date(c.editedAt ?? 0).toISOString(),
    })),
  );

  return { shows, cast };
}

export async function push(data: AppData, userId: string): Promise<{ shows: number; cast: number; deletes: number }> {
  const supabase = await requireClient();
  const { shows, cast } = collectPush(data, userId);

  if (shows.length) {
    const { error } = await supabase.from('sync_show').upsert(shows, { onConflict: 'user_id,show_id' });
    if (error) throw new Error(error.message);
  }
  if (cast.length) {
    const { error } = await supabase.from('sync_cast').upsert(cast, { onConflict: 'user_id,show_id,record_id' });
    if (error) throw new Error(error.message);
  }

  // Deletions last, so a tombstone can never be overwritten by the upsert of a record this device
  // still had in memory when the push began.
  const graves = readTombstones();
  for (const g of graves) {
    const table = g.recordId ? 'sync_cast' : 'sync_show';
    const row = {
      user_id: userId,
      show_id: g.showId,
      ...(g.recordId ? { record_id: g.recordId } : {}),
      payload: {},
      edited_at: new Date(g.deletedAt).toISOString(),
      deleted_at: new Date(g.deletedAt).toISOString(),
    };
    const { error } = await supabase
      .from(table)
      .upsert(row, { onConflict: g.recordId ? 'user_id,show_id,record_id' : 'user_id,show_id' });
    if (error) throw new Error(error.message);
  }
  // Cleared only after every one landed; a throw above leaves them queued for the next attempt.
  if (graves.length) writeTombstones([]);

  return { shows: shows.length, cast: cast.length, deletes: graves.length };
}

export async function pull(userId: string): Promise<{ rows: RemoteRow[]; newest: string | null }> {
  const supabase = await requireClient();
  const since = cursorFor(userId);

  // No `user_id` filter: RLS resolves `auth.uid()` from the caller's token and cannot return
  // another user's rows. Filtering here as well would suggest the safety lives in this line.
  const [showRes, castRes] = await Promise.all([
    supabase.from('sync_show').select('*').gt('server_at', since),
    supabase.from('sync_cast').select('*').gt('server_at', since),
  ]);
  if (showRes.error) throw new Error(showRes.error.message);
  if (castRes.error) throw new Error(castRes.error.message);

  const rows = [...(showRes.data ?? []), ...(castRes.data ?? [])] as RemoteRow[];
  const newest = rows.reduce<string | null>((max, r) => (!max || r.server_at > max ? r.server_at : max), null);
  return { rows, newest };
}

/**
 * Fold pulled rows into local data. Pure — returns a new AppData and never touches storage, so it
 * can be tested against fabricated rows without a database.
 *
 * The comparison is on `edited_at`, not on arrival: a device that was offline all day must not win
 * simply because it reconnected last.
 */
export function applyRemote(local: AppData, rows: RemoteRow[]): AppData {
  const shows = local.shows.map((s) => ({ ...s, cast: [...s.cast] }));
  const byId = new Map(shows.map((s) => [s.id, s]));

  for (const row of rows) {
    const editedAt = Date.parse(row.edited_at);
    if (row.record_id === undefined) {
      const existing = byId.get(row.show_id);
      if (row.deleted_at) {
        if (existing && (existing.editedAt ?? 0) <= editedAt) {
          shows.splice(shows.indexOf(existing), 1);
          byId.delete(row.show_id);
        }
        continue;
      }
      const incoming = { ...(row.payload as unknown as Show), id: row.show_id, editedAt };
      if (!existing) {
        byId.set(row.show_id, { ...incoming, cast: [] });
        shows.push(byId.get(row.show_id)!);
      } else if ((existing.editedAt ?? 0) < editedAt) {
        // Cast is preserved: it is synced as its own rows and this payload never carried it.
        Object.assign(existing, incoming, { cast: existing.cast });
      }
      continue;
    }

    const show = byId.get(row.show_id);
    if (!show) continue; // A cast row whose show hasn't arrived yet; the next pull will have it.
    const i = show.cast.findIndex((c) => c.id === row.record_id);
    if (row.deleted_at) {
      if (i !== -1 && (show.cast[i].editedAt ?? 0) <= editedAt) show.cast.splice(i, 1);
      continue;
    }
    const incoming = { ...(row.payload as unknown as CastMember), id: row.record_id, editedAt };
    if (i === -1) show.cast.push(incoming);
    else if ((show.cast[i].editedAt ?? 0) < editedAt) show.cast[i] = incoming;
  }

  return { ...local, shows };
}
