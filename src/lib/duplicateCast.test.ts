import { findCastDuplicates, mergeCastRecords, mergeDuplicateCast } from './duplicateCast';
import type { AppData, CastMember } from '../types';

/**
 * Standalone, like the other suites here: bundled by esbuild and run by node, asserting inline and
 * exiting non-zero on the first failure. No framework, no describe/it.
 */

let failures = 0;
function check(name: string, condition: boolean) {
  console.log(`  ${condition ? 'PASS' : 'FAIL'}  ${name}`);
  if (!condition) failures++;
}

const person = (over: Partial<CastMember>): CastMember =>
  ({ id: 'x', name: 'Someone', color: '#000', ...over }) as CastMember;

const library = (cast: CastMember[]): AppData =>
  ({ shows: [{ id: 's1', title: 'Breaking Bad', tmdbId: 1396, cast }] }) as unknown as AppData;

console.log('duplicate cast');

{ // the reported case: two records for one actor, each holding a different field
  const data = library([
    person({ id: 'p-b', actorTmdbId: 84497, name: 'Jesse Pinkman', auto: true, whoTheyAre: "Walter White's partner", editedAt: 1000 }),
    person({ id: 'p-a', actorTmdbId: 84497, name: 'Jesse Pinkman', auto: true, nickname: 'Bitch guy', editedAt: 2000 }),
  ]);
  check('the duplicate is found', findCastDuplicates(data).length === 1);

  const removed = mergeDuplicateCast(data);
  const cast = data.shows[0].cast;
  check('one record removed', removed === 1);
  check('one record remains', cast.length === 1);
  check('keeps the field from the older record', cast[0].whoTheyAre === "Walter White's partner");
  check('keeps the field from the newer record', cast[0].nickname === 'Bitch guy');
  check('survivor is the smallest id', cast[0].id === 'p-a');
  check('stamp is the newest of the two', cast[0].editedAt === 2000);
  check('no longer counts as auto-loaded', cast[0].auto === undefined);
}

{ // every device has to pick the same survivor, or they tombstone each other's keeper
  const order1 = [
    person({ id: 'p-a', actorTmdbId: 1, editedAt: 5 }),
    person({ id: 'p-b', actorTmdbId: 1, editedAt: 9 }),
  ];
  const order2 = [order1[1], order1[0]];
  check(
    'survivor does not depend on array order',
    mergeCastRecords(order1).id === mergeCastRecords(order2).id,
  );
}

{ // a contested field is decided the way the rest of sync decides things
  const merged = mergeCastRecords([
    person({ id: 'p-a', actorTmdbId: 2, notes: 'older note', editedAt: 100 }),
    person({ id: 'p-b', actorTmdbId: 2, notes: 'newer note', editedAt: 200 }),
  ]);
  check('newer edit wins a contested field', merged.notes === 'newer note');
}

{ // an empty value must never overwrite a real one, whichever record is newer
  const merged = mergeCastRecords([
    person({ id: 'p-a', actorTmdbId: 3, notes: 'kept', editedAt: 100 }),
    person({ id: 'p-b', actorTmdbId: 3, notes: '', editedAt: 999 }),
  ]);
  check('a newer blank does not erase an older value', merged.notes === 'kept');
}

{ // hand-typed records have no actor id and nothing trustworthy to match on
  const data = library([
    person({ id: 'p-a', name: 'Twin' }),
    person({ id: 'p-b', name: 'Twin' }),
  ]);
  check('records without an actor id are never merged', findCastDuplicates(data).length === 0);
  check('and nothing is removed', mergeDuplicateCast(data) === 0 && data.shows[0].cast.length === 2);
}

{ // different people, and the same person in two different shows, are both left alone
  const data = library([
    person({ id: 'p-a', actorTmdbId: 10 }),
    person({ id: 'p-b', actorTmdbId: 11 }),
  ]);
  check('different actors are left alone', mergeDuplicateCast(data) === 0);

  const twoShows = {
    shows: [
      { id: 's1', title: 'A', tmdbId: 1, cast: [person({ id: 'p-a', actorTmdbId: 10 })] },
      { id: 's2', title: 'B', tmdbId: 2, cast: [person({ id: 'p-b', actorTmdbId: 10 })] },
    ],
  } as unknown as AppData;
  check('one actor across two shows is not a duplicate', mergeDuplicateCast(twoShows) === 0);
}

{ // running it twice must not keep changing the library, or sync never settles
  const data = library([
    person({ id: 'p-b', actorTmdbId: 84497, whoTheyAre: 'a', editedAt: 1000 }),
    person({ id: 'p-a', actorTmdbId: 84497, nickname: 'b', editedAt: 2000 }),
  ]);
  mergeDuplicateCast(data);
  const first = JSON.stringify(data);
  check('a second pass is a no-op', mergeDuplicateCast(data) === 0 && JSON.stringify(data) === first);
}

{ // the merged card should stay where it was rather than jumping to the end of the grid
  const data = library([
    person({ id: 'p-a1', actorTmdbId: 7, name: 'First' }),
    person({ id: 'p-b', actorTmdbId: 8, name: 'Middle' }),
    person({ id: 'p-a2', actorTmdbId: 7, name: 'First' }),
  ]);
  mergeDuplicateCast(data);
  check('merged record keeps its position', data.shows[0].cast.map((c) => c.name).join(',') === 'First,Middle');
}

console.log(failures === 0 ? '\nall passed' : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
