/**
 * The two questions a cast record can be asked, and why they are not the same question.
 * Same shape as the other suites — no framework, run with `npm test`.
 *
 *   hasUserContent — "would deleting this lose something?"  Generous on purpose: it decides what
 *                    "Clear auto-loaded characters" may throw away and what sync must carry.
 *   hasUserNotes   — "did the user write anything here?"     Narrow on purpose: it is what the
 *                    show tile's badge counts and what the noted sheet lists.
 *
 * Conflating them shipped a real bug. A library with seven Single's Inferno contestants hidden
 * from the relationship map — and nothing written about any of them — showed "7 noted" above
 * seven cards with nothing on them. The number was true; the word was not. The cases below are
 * that bug, pinned down.
 */
import { hasUserContent, hasUserNotes, isDisposable } from './castValue';
import type { CastMember } from '../types';

const member = (over: Partial<CastMember> = {}): CastMember =>
  ({ id: 'x', name: 'Someone', nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: '',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', ...over } as CastMember);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('a bare auto-loaded record');
{
  const c = member();
  check('holds nothing', !hasUserContent(c) && !hasUserNotes(c));
  check('is disposable once auto', isDisposable(member({ auto: true } as Partial<CastMember>)));
}

console.log('writing counts for both');
{
  for (const [name, over] of [
    ['a nickname', { nickname: 'Bitch guy' }],
    ['a who-they-are line', { whoTheyAre: "Meadow's boyfriend" }],
    ['notes', { notes: 'watch how he talks about his brother' }],
    ['a gender the user set', { gender: 'F' }],
    ['a relationship', { relationships: [{ id: 'r', targetId: 't', label: 'Sister' }] }],
    ['an uploaded photo', { photo: 'data:image/jpeg;base64,abc' }],
  ] as [string, Partial<CastMember>][]) {
    const c = member(over);
    check(`${name} is content and is a note`, hasUserContent(c) && hasUserNotes(c));
  }
}

/**
 * The heart of it. Each of these is a decision worth keeping — none of them is writing, and a
 * badge that says "noted" must not count them.
 */
console.log('settings are content but are NOT notes');
{
  for (const [name, over] of [
    ['hidden from the map', { hideFromMap: true }],
    ['a reframed photo', { photoCrop: { size: 120, x: 40, y: 60 } }],
    ['a pinned first episode', { firstEpPinned: true }],
    ['revealed optional fields', { shownFields: ['hometown'] }],
  ] as [string, Partial<CastMember>][]) {
    const c = member(over);
    check(`${name}: kept by hasUserContent`, hasUserContent(c));
    check(`${name}: not counted as a note`, !hasUserNotes(c), 'this is the Single’s Inferno bug');
  }
}

console.log('a stock photo is not an upload');
{
  check('a TMDb photo url is not content', !hasUserContent(member({ photo: 'https://image.tmdb.org/t/p/w185/x.jpg' })));
  check('a TMDb photo url is not a note', !hasUserNotes(member({ photo: 'https://image.tmdb.org/t/p/w185/x.jpg' })));
}

console.log('hiding someone must never make them disposable');
{
  // The whole reason hasUserContent stays generous: clearing auto-loaded records must not
  // silently undo the map someone arranged.
  const hidden = member({ auto: true, hideFromMap: true } as Partial<CastMember>);
  check('an auto record the user hid is kept', !isDisposable(hidden));
  check('and still shows no note', !hasUserNotes(hidden));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
