/**
 * What the relationship map draws. Same shape as the other suites — no framework, run with
 * `npm test`.
 *
 * The rules are easy to state and easy to break: reciprocated "interested" is one heart, kinship
 * recorded from both ends is one line, and a parent link is directed and must never merge with
 * anything. The dating board shipped first and works; the cases below exist so adding kinship
 * cannot quietly change it.
 */
import { buildEdges, parentIdsOf, REL_KINDS } from './relationshipEdges';
import type { CastMember, MapRelationship } from '../types';

const EP = '1_Ep 1';

const person = (id: string, rels: MapRelationship[] = []): CastMember =>
  ({ id, name: id, nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: '',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', relByEp: { [EP]: rels } } as CastMember);

const rel = (id: string, targetId: string, kind: MapRelationship['kind'], label = ''): MapRelationship =>
  ({ id, targetId, kind, label });

const relsFor = (c: CastMember) => c.relByEp?.[EP] || [];

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('the dating board, unchanged');
{
  const one = buildEdges([person('a', [rel('r1', 'b', 'interested')]), person('b')], relsFor);
  check('one-way interest is a single directed line', one.length === 1 && one[0].directed && !one[0].mutual);

  const both = buildEdges([
    person('a', [rel('r1', 'b', 'interested')]),
    person('b', [rel('r2', 'a', 'interested')]),
  ], relsFor);
  check('reciprocated interest collapses to one line', both.length === 1, String(both.length));
  check('and is marked mutual, which is what draws a heart', both[0]?.mutual === true);
  check('and carries both records so deleting removes both', both[0]?.parts.length === 2);
}

console.log('kinship');
{
  const p = buildEdges([person('ned', [rel('r1', 'robb', 'parent')]), person('robb')], relsFor);
  check('a parent link is directed', p.length === 1 && p[0].directed);
  check('and points from the parent to the child', p[0]?.aId === 'ned' && p[0]?.bId === 'robb');

  const sib = buildEdges([
    person('sansa', [rel('r1', 'arya', 'sibling')]),
    person('arya', [rel('r2', 'sansa', 'sibling')]),
  ], relsFor);
  check('siblings recorded from both ends draw one line', sib.length === 1, String(sib.length));
  check('and that line has no arrowhead', sib[0]?.directed === false);
}

/** The case that would double every family tree if merging were done on target alone. */
console.log('merging is per kind, not per pair');
{
  const mixed = buildEdges([
    person('a', [rel('r1', 'b', 'parent')]),
    person('b', [rel('r2', 'a', 'sibling')]),
  ], relsFor);
  check('two different claims about one pair stay two lines', mixed.length === 2, JSON.stringify(mixed.map((e) => e.kind)));
}
{
  // Two parents of the same child is the normal case, and must never collapse into one line.
  const twoParents = buildEdges([
    person('ned', [rel('r1', 'robb', 'parent')]),
    person('cat', [rel('r2', 'robb', 'parent')]),
    person('robb'),
  ], relsFor);
  check('both parents of a child draw separately', twoParents.length === 2);
}

console.log('links to people who are not on the board');
{
  const dangling = buildEdges([person('a', [rel('r1', 'ghost', 'parent')])], relsFor);
  check('a link to someone hidden or deleted draws nothing', dangling.length === 0);
}

console.log('labels');
{
  const written = buildEdges([person('a', [rel('r1', 'b', 'other', 'Raised him')]), person('b')], relsFor);
  check('a written label is used as written', written[0]?.label === 'Raised him');
  const bare = buildEdges([person('a', [rel('r1', 'b', 'sibling')]), person('b')], relsFor);
  check('an empty label falls back to the kind', bare[0]?.label === REL_KINDS.sibling.label, bare[0]?.label);
}

console.log('parentIdsOf');
{
  const cast = [person('ned', [rel('r1', 'robb', 'parent')]), person('cat', [rel('r2', 'robb', 'parent')]), person('robb')];
  check('finds both parents', parentIdsOf('robb', cast, relsFor).sort().join() === 'cat,ned');
  check('a parent has none of their own here', parentIdsOf('ned', cast, relsFor).length === 0);
  check('a sibling link is not a parent link', parentIdsOf('arya', [person('sansa', [rel('r3', 'arya', 'sibling')])], relsFor).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
