/**
 * Merge-rule tests. No framework — adding one to cover fifteen assertions would be a bigger change
 * than the code under test. Run with:
 *
 *   npm test
 *
 * which bundles this file through esbuild (already present as vite's own dependency) and runs it
 * on node. `--define:import.meta.env={}` is what keeps the bundle from crashing on the Vite env
 * access in the supabase module this pulls in transitively. Exit code is non-zero on any failure,
 * so it drops straight into CI or a pre-push hook.
 *
 * These are here because this is the file where a mistake costs someone their work rather than
 * their afternoon. The cases that matter are the ones asserting what must NOT happen: an older
 * remote edit overwriting a newer local one, and a stale delete destroying a record that was
 * edited afterwards.
 */
import { stampEdits, applyRemote, stampRestored, readTombstones, collectPush, cursorFor, saveCursor, clearCursor } from './sync';
import type { AppData, CastMember } from '../types';

const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v; },
  removeItem: (k: string) => { delete store[k]; },
};

const member = (id: string, over: Partial<CastMember> = {}): CastMember =>
  ({ id, name: id, nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: '',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', ...over } as CastMember);

const data = (cast: CastMember[]): AppData =>
  ({ shows: [{ id: 'sh1', title: 'Show', type: 'DRAMA', color: '', status: 'watching', cast,
    poster: null, tmdbId: 1, originCountry: '', wikiUrl: '', imdbUrl: '' }] } as AppData);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('stampEdits');
{ // an edit is stamped
  const prev = data([member('a')]);
  const next = data([member('a', { nickname: 'Carm' })]);
  stampEdits(prev, next, 1000);
  check('edited record gets a timestamp', next.shows[0].cast[0].editedAt === 1000);
}
{ // an untouched record is not
  const prev = data([member('a', { editedAt: 5 })]);
  const next = data([member('a', { editedAt: 5 })]);
  stampEdits(prev, next, 1000);
  check('untouched record keeps its old stamp', next.shows[0].cast[0].editedAt === 5);
}
{ // deleting a record the user edited leaves a tombstone
  store['ct.sync.tombstones.v1'] = '[]';
  const prev = data([member('a', { nickname: 'Carm' }), member('b')]);
  const next = data([member('b')]);
  stampEdits(prev, next, 1000);
  const t = readTombstones();
  check('deleting an edited record tombstones it', t.length === 1 && t[0].recordId === 'a', JSON.stringify(t));
}
{ // deleting an auto-loaded placeholder does not
  store['ct.sync.tombstones.v1'] = '[]';
  const prev = data([member('a', { auto: true } as any), member('b')]);
  const next = data([member('b')]);
  stampEdits(prev, next, 1000);
  check('deleting a disposable record leaves no tombstone', readTombstones().length === 0);
}
{ // a hand-added record with only a name is the user's, even though hasUserContent says otherwise
  store['ct.sync.tombstones.v1'] = '[]';
  const prev = data([member('a', { name: 'Carmy' }), member('b')]);   // no `auto` flag
  const next = data([member('b')]);
  stampEdits(prev, next, 1000);
  check('deleting a hand-added, name-only record tombstones it', readTombstones().length === 1);
}

{ // React may run a state updater twice for one update; the queue must not grow a second grave
  store['ct.sync.tombstones.v1'] = '[]';
  const prev = data([member('a', { nickname: 'Carm' }), member('b')]);
  const next = data([member('b')]);
  stampEdits(prev, next, 1000);
  stampEdits(prev, next, 1000);
  check('a repeated stamp does not duplicate the tombstone', readTombstones().length === 1, JSON.stringify(readTombstones()));
}

console.log('applyRemote — the conflict rule');
{ // remote newer wins
  const local = data([member('a', { nickname: 'old', editedAt: 100 })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: member('a', { nickname: 'new' }),
                  edited_at: new Date(200).toISOString(), server_at: 'x', deleted_at: null }];
  const out = applyRemote(local, rows as any);
  check('newer remote edit wins', out.shows[0].cast[0].nickname === 'new');
}
{ // local newer wins — the offline-device case
  const local = data([member('a', { nickname: 'local-newer', editedAt: 300 })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: member('a', { nickname: 'remote-older' }),
                  edited_at: new Date(200).toISOString(), server_at: 'x', deleted_at: null }];
  const out = applyRemote(local, rows as any);
  check('older remote edit does NOT clobber a newer local one', out.shows[0].cast[0].nickname === 'local-newer');
}
{ // tombstone removes
  const local = data([member('a', { editedAt: 100 })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: {},
                  edited_at: new Date(200).toISOString(), server_at: 'x', deleted_at: new Date(200).toISOString() }];
  check('remote delete removes the record', applyRemote(local, rows as any).shows[0].cast.length === 0);
}
{ // a delete older than a local edit does not win — you edited it after deleting elsewhere
  const local = data([member('a', { nickname: 'revived', editedAt: 300 })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: {},
                  edited_at: new Date(200).toISOString(), server_at: 'x', deleted_at: new Date(200).toISOString() }];
  check('stale remote delete does not destroy a newer local edit',
        applyRemote(local, rows as any).shows[0].cast.length === 1);
}
{ // records with no stamp at all (everything written before sync existed) lose to remote
  const local = data([member('a', { nickname: 'unstamped' })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: member('a', { nickname: 'from-server' }),
                  edited_at: new Date(1).toISOString(), server_at: 'x', deleted_at: null }];
  check('an unstamped legacy record is treated as older', applyRemote(local, rows as any).shows[0].cast[0].nickname === 'from-server');
}
{ // cast is not wiped when a show row arrives
  const local = data([member('a', { editedAt: 100 })]);
  const rows = [{ show_id: 'sh1', payload: { title: 'Renamed' },
                  edited_at: new Date(500).toISOString(), server_at: 'x', deleted_at: null }];
  const out = applyRemote(local, rows as any);
  check('a show update keeps its cast', out.shows[0].cast.length === 1 && out.shows[0].title === 'Renamed');
}
{ // input is not mutated
  const local = data([member('a', { nickname: 'orig', editedAt: 100 })]);
  const rows = [{ show_id: 'sh1', record_id: 'a', payload: member('a', { nickname: 'new' }),
                  edited_at: new Date(200).toISOString(), server_at: 'x', deleted_at: null }];
  applyRemote(local, rows as any);
  check('applyRemote does not mutate its input', local.shows[0].cast[0].nickname === 'orig');
}

{ // guard the fixture itself: an auto record with any user field must still tombstone
  store['ct.sync.tombstones.v1'] = '[]';
  const prev = data([member('a', { auto: true, nickname: 'mine' } as any), member('b')]);
  const next = data([member('b')]);
  stampEdits(prev, next, 1000);
  check('an auto record the user edited still tombstones', readTombstones().length === 1);
}

console.log('collectPush — duplicate ids');
{ // Postgres rejects the whole statement if a batch touches one row twice, so this must not happen
  const dup = data([member('same', { nickname: 'first', editedAt: 100 }), member('same', { nickname: 'second', editedAt: 200 })]);
  const { cast } = collectPush(dup, 'u1');
  check('duplicate record ids collapse to one row', cast.length === 1, `got ${cast.length}`);
  check('the newer edit is the one sent', (cast[0].payload as any).nickname === 'second');
}

/**
 * The cursor is a high-water mark, and its failure mode is silence: a row that falls behind it is
 * never asked for again, so the loss shows up as work that simply never arrived on the other
 * device — surviving refreshes, reinstalls and, until clearCursor existed, signing out.
 */
/**
 * Position has to travel, or the same library reads differently on two devices: whoever loaded the
 * credits sees the leads at the top and whoever received them over sync sees them under the
 * extras, in whatever order the rows arrived. This is the reported symptom — Walter alone at the
 * top, Jesse, Hank and Skyler at the bottom — pinned down.
 */
console.log('arriving records keep their position');
{
  const remote = (id: string, order: number | undefined, at = '2026-08-30T06:00:00.000Z') => ({
    show_id: 'sh1', record_id: id, payload: { id, name: id, ...(order === undefined ? {} : { order }) },
    edited_at: at, server_at: at, deleted_at: null,
  });

  // Walter is already here at position 0; the other three arrive over sync.
  const local = data([member('walter', { order: 0 } as Partial<CastMember>)]);
  const merged = applyRemote(local, [
    remote('hank', 3), remote('skyler', 1), remote('jesse', 2),
  ] as any);
  check('they land in their own order, not arrival order',
    merged.shows[0].cast.map((c) => c.id).join() === 'walter,skyler,jesse,hank',
    merged.shows[0].cast.map((c) => c.id).join());
}
{
  // Anything written before `order` existed still has to go somewhere sane.
  const local = data([member('walter', { order: 0 } as Partial<CastMember>), member('nameless')]);
  const merged = applyRemote(local, [{
    show_id: 'sh1', record_id: 'skyler', payload: { id: 'skyler', name: 'skyler', order: 1 },
    edited_at: '2026-08-30T06:00:00.000Z', server_at: '2026-08-30T06:00:00.000Z', deleted_at: null,
  }] as any);
  check('a positioned arrival sorts above an unpositioned local record',
    merged.shows[0].cast.map((c) => c.id).join() === 'walter,skyler,nameless',
    merged.shows[0].cast.map((c) => c.id).join());
}
{
  const local = data([member('walter', { order: 0 } as Partial<CastMember>)]);
  const merged = applyRemote(local, [{
    show_id: 'sh1', record_id: 'mystery', payload: { id: 'mystery', name: 'mystery' },
    edited_at: '2026-08-30T06:00:00.000Z', server_at: '2026-08-30T06:00:00.000Z', deleted_at: null,
  }] as any);
  check('an arrival with no position is appended, as before',
    merged.shows[0].cast.map((c) => c.id).join() === 'walter,mystery');
}

console.log('the sync cursor');
{
  const A = 'user-a', B = 'user-b';
  const T1 = '2026-08-30T05:00:00.000Z';

  clearCursor();
  check('with no mark, a pull starts from the beginning', cursorFor(A) === new Date(0).toISOString());

  saveCursor(A, T1);
  check('a saved mark is resumed from', cursorFor(A) === T1);

  // The mark belongs to an account, not a device: resuming someone else's would skip every row
  // written before it.
  check('another account does not inherit it', cursorFor(B) === new Date(0).toISOString());

  clearCursor();
  check('clearing sends the next pull back to the beginning', cursorFor(A) === new Date(0).toISOString());

  // The recovery path, end to end: a device that has stepped past rows can ask for everything.
  saveCursor(A, T1);
  clearCursor();
  saveCursor(A, '2026-08-30T06:00:00.000Z');
  check('and a later mark still saves normally afterwards', cursorFor(A) === '2026-08-30T06:00:00.000Z');
}

/**
 * Restoring a backup, for someone who is signed in.
 *
 * This is the case where losing costs the most: the user has already ruined something, the damage
 * has already synced, and the backup file is the last copy of what they had. It used to be
 * defeated by the merge rule — the file's records carry the stamps they were written with, which
 * are older than the damage on the server, so the next pull put the damage straight back.
 */
console.log('restoring a backup beats what is on the server');
{
  const OLD = Date.parse('2026-07-01T00:00:00.000Z');   // when the backup was taken
  const BAD = Date.parse('2026-08-01T00:00:00.000Z');   // when the record was ruined, and synced
  const backup = data([member('a', { notes: 'the notes I want back', editedAt: OLD })]);
  const remoteDamage = [{
    show_id: 'sh1', record_id: 'a',
    payload: { id: 'a', name: 'a', notes: '' },
    edited_at: new Date(BAD).toISOString(), server_at: new Date(BAD).toISOString(), deleted_at: null,
  }] as any;

  // The old behaviour, kept as a case so the regression is visible rather than remembered.
  const unstamped = applyRemote(backup, remoteDamage);
  check('an unstamped restore loses to the newer damage on the server',
    unstamped.shows[0].cast[0].notes === '', JSON.stringify(unstamped.shows[0].cast[0].notes));

  const restored = stampRestored(backup, BAD + 1000);
  const merged = applyRemote(restored, remoteDamage);
  check('a stamped restore survives the next pull',
    merged.shows[0].cast[0].notes === 'the notes I want back', merged.shows[0].cast[0].notes);
}
{
  const NOW = 1_800_000_000_000;
  const before = data([member('a', { editedAt: 1 }), member('b')]);
  const after = stampRestored(before, NOW);

  check('every restored record carries the moment of the restore',
    after.shows[0].cast.every((c) => c.editedAt === NOW));
  check('including one that had no stamp at all', after.shows[0].cast[1].editedAt === NOW);
  check('and the show itself, which syncs on the same rule', after.shows[0].editedAt === NOW);
  check('the library it was given is not mutated',
    before.shows[0].cast[0].editedAt === 1 && before.shows[0].editedAt === undefined);
  check('nothing else about a record is touched',
    after.shows[0].cast[0].id === 'a' && after.shows[0].title === 'Show');
}
{
  /**
   * A restore is a statement about the whole library, so a record identical to the one already
   * here is stamped too — the copy on the server may differ from both, and it is the server this
   * has to beat.
   */
  const same = data([member('a', { notes: 'unchanged', editedAt: 500 })]);
  check('a record that already matches is stamped anyway',
    stampRestored(same, 9_000).shows[0].cast[0].editedAt === 9_000);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
