/**
 * Merge-rule tests. No framework — there is no test runner in this project, and adding one to
 * cover eleven assertions would be a bigger change than the code under test. Run with:
 *
 *   npx esbuild src/lib/sync.test.ts --bundle --platform=node --format=esm \
 *     --define:import.meta.env='{}' --outfile=/tmp/t.mjs && node /tmp/t.mjs
 *
 * These are here because this is the file where a mistake costs someone their work rather than
 * their afternoon. The cases that matter are the ones asserting what must NOT happen: an older
 * remote edit overwriting a newer local one, and a stale delete destroying a record that was
 * edited afterwards.
 */
import { stampEdits, applyRemote, readTombstones } from './sync';
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
