/**
 * What the relationship map draws. Same shape as the other suites — no framework, run with
 * `npm test`.
 *
 * The rules are easy to state and easy to break: reciprocated "interested" is one heart, kinship
 * recorded from both ends is one line, and a parent link is directed and must never merge with
 * anything. The dating board shipped first and works; the cases below exist so adding kinship
 * cannot quietly change it.
 */
import { buildEdges, parentIdsOf, resolveKindOption, writesBothEnds, KIND_GROUPS, REALITY_GROUPS, KIND_OPTIONS, KINSHIP_KINDS, REL_KINDS } from './relationshipEdges';
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

/**
 * "Child of" is the same fact as "parent of", said from the other end — so it has to produce the
 * same single record and the same single line, whichever end the user happened to drag from. The
 * cases below are the ones that would let an inverse kind sneak back in: a swapped pair that draws
 * twice, or an arrow that points at the parent.
 */
console.log('child of');
{
  const r = resolveKindOption('child', 'robb', 'ned');
  check('the record lands on the parent, not the child', r.sourceId === 'ned' && r.targetId === 'robb', `${r.sourceId}->${r.targetId}`);
  check('and it is a parent link, not a kind of its own', r.kind === 'parent');

  const plain = resolveKindOption('sibling', 'sansa', 'arya');
  check('an uninverted option is left exactly as drawn', plain.sourceId === 'sansa' && plain.targetId === 'arya' && plain.kind === 'sibling');

  // What the picker cannot send, but `createRelationship` would crash on if it ever did.
  check('an unrecognised option falls back to "other"', resolveKindOption('stepmother', 'a', 'b').kind === 'other');
}
{
  // Drawn from Robb, saying "child of Ned". Identical to Ned saying "parent of Robb".
  const r = resolveKindOption('child', 'robb', 'ned');
  const drawn = buildEdges([person('ned', [rel('r1', 'robb', r.kind)]), person('robb')], relsFor);
  check('one line, pointing from the parent down to the child', drawn.length === 1 && drawn[0].aId === 'ned' && drawn[0].bId === 'robb');
  check('and it still carries the arrowhead', drawn[0]?.directed === true);

  // The whole reason `child` is not a kind. Both drags describe one fact, so both must write the
  // identical record — an inverse kind would instead leave two, and buildEdges would draw both.
  const fromParent = resolveKindOption('parent', 'ned', 'robb');
  check('drawn from either end, it is the same record',
    fromParent.sourceId === r.sourceId && fromParent.targetId === r.targetId && fromParent.kind === r.kind);

  check('a child link places the child under the parent, as a parent link does',
    parentIdsOf('robb', [person('ned', [rel('r1', 'robb', r.kind)]), person('robb')], relsFor).join() === 'ned');
}

/**
 * The taxonomy grew from four kinds to eleven, and two invariants have to survive the next person
 * who adds one. Every kind the picker offers must have metadata, or it draws an undefined label;
 * and `parent` must remain the only asymmetric one, because that is what the arrowhead means and
 * what stops the other ten from drawing themselves twice.
 */
console.log('the taxonomy');
{
  const missing = KINSHIP_KINDS.filter((k) => !REL_KINDS[k]);
  check('every offered kind has metadata', missing.length === 0, missing.join());

  const asymmetric = (Object.keys(REL_KINDS) as (keyof typeof REL_KINDS)[]).filter((k) => !REL_KINDS[k].symmetric);
  check('parent is the only asymmetric kind', asymmetric.join() === 'parent', asymmetric.join());

  /**
   * Three kinds point, and each one points for its own reason: a parent at a child, a suitor at
   * whoever they fancy, a player at whoever they are coming for. What matters is not how many
   * there are but that every one of them can be recorded from either end — an arrow is the one
   * mark whose meaning inverts if you drag the wrong way, and the picker has to offer the way back.
   */
  const arrowed = (Object.keys(REL_KINDS) as (keyof typeof REL_KINDS)[]).filter((k) => REL_KINDS[k].directed).sort();
  check('the kinds that draw an arrow are the ones that point',
    arrowed.join() === 'interested,parent,target', arrowed.join());

  const unrecoverable = arrowed.filter((k) => {
    if (!REL_KINDS[k].symmetric) return false;  // asymmetric kinds carry their own direction
    return !KIND_OPTIONS.some((o) => o.kind === k && o.invert);
  });
  check('and every one of them can be drawn from either end', unrecoverable.length === 0, unrecoverable.join());

  const values = KIND_OPTIONS.map((o) => o.value);
  check('no option is offered twice', new Set(values).size === values.length, values.join());

  const grouped = KIND_GROUPS.flatMap((g) => g.options.map((o) => o.value));
  check('"other" is outside the groups, as the escape hatch', !grouped.includes('other') && KINSHIP_KINDS.includes('other'));

  /**
   * One fact, one kind. `parent` is allowed to back two options because they are the same link
   * read from opposite ends; a second kind sharing an option would be a genuine duplicate.
   */
  /**
   * Inverting is only meaningful for a kind that points. Swapping the ends of a symmetric,
   * undirected link — two siblings, two allies — produces the identical record, so an inverted
   * option there would be a second button that does the same thing as the first.
   */
  const inverted = KIND_OPTIONS.filter((o) => o.invert);
  check('something is invertible', inverted.length > 0);
  const pointless = inverted.filter((o) => !REL_KINDS[o.kind].directed);
  check('and only the kinds that point can be inverted', pointless.length === 0, pointless.map((o) => o.value).join());
  const uninverted = KIND_OPTIONS.filter((o) => !o.invert).map((o) => o.kind);
  check('every other option is its own kind, once', new Set(uninverted).size === uninverted.length, uninverted.join());

  const labels = KINSHIP_KINDS.map((k) => REL_KINDS[k].label);
  check('no two kinds share a label', new Set(labels).size === labels.length, labels.join());
}

/** Every symmetric kind has to collapse, not just the two that existed first. */
console.log('every symmetric kind merges');
{
  const notMerged = KINSHIP_KINDS.filter((k) => {
    if (!REL_KINDS[k].symmetric) return false;
    const edges = buildEdges([
      person('a', [rel('r1', 'b', k)]),
      person('b', [rel('r2', 'a', k)]),
    ], relsFor);
    return edges.length !== 1 || !edges[0].mutual;
  });
  check('recorded from both ends, each draws one line', notMerged.length === 0, notMerged.join());
}

/**
 * The reality vocabulary. A dating board used to have one meaning and no picker; it now has to
 * carry a competition too, where the thing worth recording is who is working with whom and who is
 * about to be sent home.
 */
console.log('the reality vocabulary');
{
  const values = REALITY_GROUPS.flatMap((g) => g.options.map((o) => o.value));
  const unresolvable = values.filter((v) => !KIND_OPTIONS.some((o) => o.value === v));
  check('every option the reality picker offers can be resolved', unresolvable.length === 0, unresolvable.join());
  check('and it offers the two the ask was about', values.includes('ally') && values.includes('target'));
}
{
  // Targeting points, so it must record the same fact from whichever end it was drawn.
  const forward = resolveKindOption('target', 'sana', 'jia');
  const backward = resolveKindOption('targeted-by', 'jia', 'sana');
  check('"targeting" and "targeted by" write the same record',
    JSON.stringify(forward) === JSON.stringify(backward), JSON.stringify([forward, backward]));
  check('and it is the hunter the record sits on', forward.sourceId === 'sana' && forward.targetId === 'jia');
}
{
  const oneWay = buildEdges([person('a', [rel('r1', 'b', 'target')]), person('b')], relsFor);
  check('one-way targeting keeps its arrow', oneWay.length === 1 && oneWay[0].directed);

  const feud = buildEdges([
    person('a', [rel('r1', 'b', 'target')]),
    person('b', [rel('r2', 'a', 'target')]),
  ], relsFor);
  check('two people targeting each other is one line, not two', feud.length === 1, String(feud.length));
  check('and it drops the arrow, because it no longer points anywhere', feud[0]?.directed === false);
  /**
   * The heart is drawn for mutual `interested` and nothing else. A mutual target is a feud, and the
   * map would be lying about the show if it drew one as the other.
   */
  check('a feud is not a romance', feud[0]?.kind === 'target' && feud[0]?.mutual === true);
}
{
  const allies = buildEdges([
    person('a', [rel('r1', 'b', 'ally')]),
    person('b', [rel('r2', 'a', 'ally')]),
  ], relsFor);
  check('an alliance recorded from both ends draws one line', allies.length === 1);
  check('with no arrowhead, because neither of them is the ally', allies[0]?.directed === false);

  const mixed = buildEdges([
    person('a', [rel('r1', 'b', 'ally')]),
    person('b', [rel('r2', 'a', 'target')]),
  ], relsFor);
  check('an alliance one way and a target the other stays two lines — that is the show',
    mixed.length === 2, JSON.stringify(mixed.map((e) => e.kind)));
}
{
  // The vocabularies overlap on purpose; what they must not do is disagree about a word.
  const kinshipValues = KIND_GROUPS.flatMap((g) => g.options.map((o) => o.value));
  const realityValues = REALITY_GROUPS.flatMap((g) => g.options.map((o) => o.value));
  const shared = kinshipValues.filter((v) => realityValues.includes(v));
  const disagree = shared.filter((v) => {
    const a = KIND_GROUPS.flatMap((g) => g.options).find((o) => o.value === v)!;
    const b = REALITY_GROUPS.flatMap((g) => g.options).find((o) => o.value === v)!;
    return a.kind !== b.kind || !!a.invert !== !!b.invert;
  });
  check('a word offered by both pickers means the same thing in both', disagree.length === 0, disagree.join());
}

/**
 * Which links the board writes at both ends when you draw one.
 *
 * This was `symmetric` and it was wrong, in a way that only showed up by drawing on the board: one
 * -way interest came back as a mutual heart, because `symmetric` means "two of these merge" and
 * was being read as "assert both ends". Kept as its own function so the distinction has somewhere
 * to be tested.
 */
console.log('what a single drag writes');
{
  check('an alliance is written at both ends — both halves are the same fact', writesBothEnds('ally'));
  check('so is a sibling', writesBothEnds('sibling'));
  check('so is a final deal', writesBothEnds('deal'));

  check('interest is not, or one-way interest would draw itself a heart', !writesBothEnds('interested'));
  check('nor is targeting, which is a fact about the hunter until the other agrees', !writesBothEnds('target'));
  check('nor is parent, which is not the same fact from the other end', !writesBothEnds('parent'));
}
{
  /** Every kind that draws an arrow must be left one-way, or the arrow can never be seen. */
  const mirroredButPointing = (Object.keys(REL_KINDS) as (keyof typeof REL_KINDS)[])
    .filter((k) => REL_KINDS[k].directed && writesBothEnds(k));
  check('nothing that points is ever written at both ends', mirroredButPointing.length === 0, mirroredButPointing.join());
}
{
  // The end-to-end version of the bug: draw interest once, and it must still be an arrow.
  const oneWay = buildEdges([person('a', [rel('r1', 'b', 'interested')]), person('b')], relsFor);
  check('one-way interest stays an arrow and not a heart',
    oneWay.length === 1 && oneWay[0].directed && !oneWay[0].mutual);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
