/**
 * Duplicate-show rules. Same shape as sync.test.ts — no framework, run with `npm test`.
 *
 * The cases that matter are the ones asserting what must NOT happen: a copy holding the user's
 * notes being deleted automatically, and two devices resolving the same group to different keepers.
 */
import { findDuplicateGroups, planResolution, applyResolutions, mergeGroup, keptCount } from './duplicateShows';
import type { AppData, CastMember, Show } from '../types';

const member = (id: string, over: Partial<CastMember> = {}): CastMember =>
  ({ id, name: id, nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: '',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', ...over } as CastMember);

const auto = (id: string) => member(id, { auto: true } as Partial<CastMember>);
const authored = (id: string) => member(id, { notes: 'mine' });

const show = (id: string, tmdbId: number | null, cast: CastMember[] = [], title = 'Reacher'): Show =>
  ({ id, title, type: 'DRAMA', color: '', status: 'watching', cast, poster: null, tmdbId,
     originCountry: '', wikiUrl: '', imdbUrl: '' } as Show);

const data = (shows: Show[]): AppData => ({ shows } as AppData);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('keptCount');
{
  check('auto-loaded cast is not work', keptCount(show('a', 1, [auto('x'), auto('y')])) === 0);
  check('a record with notes is', keptCount(show('a', 1, [auto('x'), authored('y')])) === 1);
}

console.log('findDuplicateGroups');
{
  const d = data([show('s1', 108978), show('s2', 108978), show('s3', 2316)]);
  const groups = findDuplicateGroups(d);
  check('groups by tmdb id', groups.length === 1 && groups[0].shows.length === 2);
}
{ // shows without a tmdb id are not the same show as each other
  const groups = findDuplicateGroups(data([show('s1', null), show('s2', null)]));
  check('untitled ids never group', groups.length === 0);
}

console.log('planResolution — the rule');
{ // one empty, one with notes: the empty one goes, no question asked
  const d = data([show('empty', 1, [auto('x')]), show('mine', 1, [authored('y')])]);
  const plan = planResolution(findDuplicateGroups(d)[0]);
  check('the copy with notes is kept', plan?.keepId === 'mine' && plan?.dropIds.join() === 'empty');
}
{ // both empty: resolves anyway, no user question for a choice that cannot matter
  const d = data([show('a', 1, [auto('x')]), show('b', 1, [])]);
  const plan = planResolution(findDuplicateGroups(d)[0]);
  check('two empty copies resolve automatically', !!plan && plan.dropIds.length === 1);
}
{ // both hold work: this is the user's call and must not resolve itself
  const d = data([show('a', 1, [authored('x')]), show('b', 1, [authored('y')])]);
  check('two copies with notes ask instead', planResolution(findDuplicateGroups(d)[0]) === null);
}
{ // determinism: the same group must resolve identically wherever it is evaluated
  const one = planResolution(findDuplicateGroups(data([show('a', 1, [auto('p')]), show('b', 1, [auto('q'), auto('r')])]))[0]);
  const two = planResolution(findDuplicateGroups(data([show('b', 1, [auto('q'), auto('r')]), show('a', 1, [auto('p')])]))[0]);
  check('order of evaluation does not change the keeper', one?.keepId === two?.keepId, `${one?.keepId} vs ${two?.keepId}`);
}

console.log('applyResolutions');
{
  const d = data([show('empty', 108978, [auto('x')]), show('mine', 108978, [authored('y')]), show('solo', 2316)]);
  const { removed, needsChoice } = applyResolutions(d);
  check('the empty duplicate is removed', removed === 1 && d.shows.length === 2);
  check('the untouched show is left alone', d.shows.some((s) => s.id === 'solo'));
  check('nothing is queued for the user', needsChoice.length === 0);
}
{
  const d = data([show('a', 1, [authored('x')]), show('b', 1, [authored('y')])]);
  const { removed, needsChoice } = applyResolutions(d);
  check('an ambiguous group deletes nothing', removed === 0 && d.shows.length === 2);
  check('and is handed back to be asked about', needsChoice.length === 1);
}

console.log('mergeGroup');
{
  const d = data([show('keep', 1, [authored('x')]), show('other', 1, [authored('y'), auto('z')])]);
  mergeGroup(d, 1, 'keep');
  const kept = d.shows[0];
  check('one show remains', d.shows.length === 1 && kept.id === 'keep');
  check('the other copy’s notes come across', kept.cast.some((c) => c.id === 'y'));
  check('its auto-loaded cast does not', !kept.cast.some((c) => c.id === 'z'));
}
{ // the same record id on both sides must not be duplicated into the keeper
  const d = data([show('keep', 1, [authored('same')]), show('other', 1, [authored('same')])]);
  mergeGroup(d, 1, 'keep');
  check('a record already present is not added twice', d.shows[0].cast.filter((c) => c.id === 'same').length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
