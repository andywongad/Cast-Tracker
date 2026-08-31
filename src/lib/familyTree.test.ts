/**
 * What a seeded family tree is allowed to contain. Same shape as the other suites — no framework,
 * run with `npm test`.
 *
 * The fixture is Game of Thrones episode one, because it is the hardest possible case and the one
 * that decides whether this feature is shippable. Every model that has read the internet knows who
 * Jon Snow's parents are. A tree built from the first episode that says so is not a bug in the
 * usual sense — the fact is true and the model is not confused — it simply ruins the show for
 * someone who is eight episodes in and asked for help keeping the Starks straight.
 *
 * So the cases below are mostly about what must NOT survive. The source paragraph is what episode
 * one establishes and nothing else; anything a model would add from memory has no sentence to
 * quote, and that is the lock being tested.
 */
import { verifyTree, stripEvidence } from './familyTree/verify';
import { narrowToRelational } from './familyTree/narrow';
import { planSeed } from './familyTree/seed';
import type { FamilyTree } from './familyTree/types';
import type { CastMember, MapRelationship } from '../types';
import { TREE_REL_KINDS, type TreeRelKind } from './familyTree/types';
import type { MapRelKind } from '../types';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

/**
 * The seeded kinds must stay a subset of the map's own vocabulary, or a seed writes records the
 * map cannot label and REL_KINDS[kind] renders undefined. Checked here rather than in types.ts,
 * which is deliberately import-free so both tsconfigs can read it.
 */
const _subset: MapRelKind = 'parent' as TreeRelKind;
void _subset;

/** Exactly what the first episode presents, in the register a source article would use. */
const SOURCE = [
  'Eddard Stark, Lord of Winterfell, rules the North alongside his wife Catelyn Stark.',
  'Their children are Robb, Sansa, Arya, Bran and Rickon.',
  "Jon Snow, raised at Winterfell beside them, is introduced as Eddard's illegitimate son.",
  'King Robert Baratheon rides north with his wife Cersei Lannister and her twin brother Jaime Lannister.',
  "Cersei's younger brother Tyrion Lannister travels with the royal party.",
  'Across the Narrow Sea, Viserys Targaryen arranges the marriage of his sister Daenerys Targaryen to Khal Drogo.',
].join(' ');

/** The numbered list the model is given. Indices below are positions in this array. */
const CAST = [
  'Eddard Stark',      // 0
  'Catelyn Stark',     // 1
  'Robb Stark',        // 2
  'Sansa Stark',       // 3
  'Arya Stark',        // 4
  'Bran Stark',        // 5
  'Jon Snow',          // 6
  'Robert Baratheon',  // 7
  'Cersei Lannister',  // 8
  'Jaime Lannister',   // 9
  'Tyrion Lannister',  // 10
  'Daenerys Targaryen',// 11
  'Viserys Targaryen', // 12
  'Khal Drogo',        // 13
];

const run = (edges: unknown) => verifyTree(edges, { castSize: CAST.length, source: SOURCE });
const quote = {
  starkParents: 'Eddard Stark, Lord of Winterfell, rules the North alongside his wife Catelyn Stark',
  children: 'Their children are Robb, Sansa, Arya, Bran and Rickon',
  jon: "Jon Snow, raised at Winterfell beside them, is introduced as Eddard's illegitimate son",
  twins: 'his wife Cersei Lannister and her twin brother Jaime Lannister',
  drogo: 'arranges the marriage of his sister Daenerys Targaryen to Khal Drogo',
};

console.log('what the episode actually establishes');
{
  const { edges } = run([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 0, to: 6, kind: 'parent', evidence: quote.jon },
    { from: 0, to: 1, kind: 'spouse', evidence: quote.starkParents },
    { from: 8, to: 9, kind: 'sibling', evidence: quote.twins },
    { from: 11, to: 13, kind: 'spouse', evidence: quote.drogo },
  ]);
  check('a tree the first episode supports survives intact', edges.length === 5, String(edges.length));
  check('and a parent edge points from the parent to the child',
    edges[0].from === 0 && edges[0].to === 2 && edges[0].kind === 'parent');
  check('the illegitimate son the episode names is kept — it is what the episode says',
    edges.some((e) => e.kind === 'parent' && e.from === 0 && e.to === 6));
}

console.log('the spoiler cases');
{
  /**
   * The whole feature in one assertion. Every clause here is true of the series and none of it is
   * in a paragraph about the first episode, so none of it has a sentence to quote.
   */
  const { edges, report } = run([
    { from: 11, to: 6, kind: 'extended', evidence: 'Daenerys Targaryen is Jon Snow’s aunt.' },
    { from: 12, to: 6, kind: 'extended', evidence: 'Jon Snow is the nephew of Viserys Targaryen.' },
    { from: 8, to: 9, kind: 'spouse', evidence: 'Cersei and Jaime Lannister are lovers and parents.' },
  ]);
  check('a true fact the source never stated is dropped', edges.length === 0, JSON.stringify(edges));
  check('and it is dropped for the stated reason, not by luck',
    report.dropped.some((d) => d.reason === 'evidence_not_in_source' && d.count === 3),
    JSON.stringify(report.dropped));
}
{
  // Rhaegar and Lyanna are not in the episode's cast, so there is no number that means them.
  const { edges, report } = run([
    { from: 14, to: 6, kind: 'parent', evidence: quote.jon },
    { from: -1, to: 6, kind: 'parent', evidence: quote.jon },
  ]);
  check('a character who is not in this episode cannot be referenced at all', edges.length === 0);
  check('and that is the index lock, not the evidence lock',
    report.dropped.some((d) => d.reason === 'index_out_of_range' && d.count === 2),
    JSON.stringify(report.dropped));
}
{
  // A quote short enough to appear in any text is not evidence of anything.
  const { edges, report } = run([{ from: 11, to: 6, kind: 'extended', evidence: 'his sister' }]);
  check('a quote too short to mean anything is not evidence', edges.length === 0);
  check('and is named as such', report.dropped[0]?.reason === 'evidence_too_short', JSON.stringify(report.dropped));
}
{
  // Models reflow whitespace and curl apostrophes when they quote. That must not read as invention.
  const { edges } = run([
    { from: 0, to: 6, kind: 'parent', evidence: "Jon Snow,  raised at Winterfell beside them,\nis introduced as Eddard’s illegitimate son" },
  ]);
  check('an honest quote that was reflowed still counts as quoted', edges.length === 1);
}

console.log('shape');
{
  const { edges, report } = run([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 2, to: 0, kind: 'parent', evidence: quote.children },
  ]);
  check('a parent cycle is broken, keeping the first claim', edges.length === 1 && edges[0].from === 0);
  check('and says so', report.dropped.some((d) => d.reason === 'parent_cycle'), JSON.stringify(report.dropped));
}
{
  const { edges } = run([{ from: 3, to: 3, kind: 'sibling', evidence: quote.children }]);
  check('nobody is their own sibling', edges.length === 0);
}
{
  const { edges } = run([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 1, to: 2, kind: 'parent', evidence: quote.children },
    { from: 7, to: 2, kind: 'parent', evidence: quote.children },
  ]);
  check('a third parent is model confusion, not a step-parent', edges.length === 2, String(edges.length));
}
{
  /**
   * The dropped row must not still count against the rows after it. Ned repeated, then Catelyn:
   * if the duplicate had been tallied before it was discarded, Robb would have looked like he
   * already had two parents and his mother would have been dropped as the third.
   */
  const { edges } = run([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 1, to: 2, kind: 'parent', evidence: quote.starkParents },
  ]);
  check('a row that is dropped does not count against the rows after it',
    edges.length === 2 && edges[1].from === 1, JSON.stringify(edges.map((e) => e.from)));
}
{
  const { edges } = run([
    { from: 8, to: 9, kind: 'sibling', evidence: quote.twins },
    { from: 9, to: 8, kind: 'spouse', evidence: quote.twins },
  ]);
  check('one pair holds one relationship, first wins', edges.length === 1 && edges[0].kind === 'sibling');
}
{
  const { edges } = run([
    null,
    { from: '0', to: 2, kind: 'parent', evidence: quote.children },
    { from: 0, to: 2, kind: 'godparent', evidence: quote.children },
    { from: 0, to: 2, kind: 'parent' },
  ]);
  check('malformed rows are dropped rather than crashing the seed', edges.length === 0);
  check('and a kind outside the four is not smuggled in', !edges.some((e) => (e.kind as string) === 'godparent'));
}
{
  check('an empty response is an empty tree, not an error', run([]).edges.length === 0);
  check('a response that is not a list at all is an empty tree', run({ edges: [] }).edges.length === 0);
  check('the four kinds are exactly the map kinds the seed may write',
    TREE_REL_KINDS.join() === 'parent,sibling,spouse,extended', TREE_REL_KINDS.join());
}

/**
 * The source narrowing. Not a spoiler filter — a two-name sentence from season six survives it —
 * but the thing that decides how much of an article the model ever sees, and therefore how much
 * there is to be tempted by.
 */
console.log('narrowing the source');
{
  const article = [
    'Eddard Stark, Lord of Winterfell, rules the North alongside his wife Catelyn Stark.',
    'Winterfell is the ancestral seat of House Stark and lies in the North.',
    'Eddard is executed on the steps of the Great Sept of Baelor.',
    "Cersei's younger brother Tyrion Lannister travels with the royal party.",
  ].join(' ');
  const got = narrowToRelational(article, CAST);

  check('a sentence naming two people is kept', got.includes('rules the North alongside his wife'));
  check('a sentence naming one person is dropped', !got.includes('Great Sept'));
  check('a sentence naming a place, not people, is dropped', !got.includes('ancestral seat'));
  check('and the surviving order is the article order',
    got.indexOf('Eddard Stark') < got.indexOf('Tyrion Lannister'));
}
{
  // "Stark" answers to six people here, so it identifies nobody; "Eddard" and "Catelyn" do.
  const shared = 'The Stark children were raised at Winterfell by the Stark household staff.';
  check('a surname everyone shares does not make a sentence relational',
    narrowToRelational(shared, CAST) === '', narrowToRelational(shared, CAST));

  const named = 'Eddard and Catelyn had been married for many years by the events of the series.';
  check('given names that identify one person each do', narrowToRelational(named, CAST) === named);
}
{
  check('an article with nothing relational in it narrows to nothing',
    narrowToRelational('The series premiered in 2011 and ran for eight seasons.', CAST) === '');
  check('no cast list means nothing to narrow against', narrowToRelational('Anything at all.', []) === '');

  const long = Array.from({ length: 200 }, () => 'Eddard Stark rules the North alongside Catelyn Stark.').join(' ');
  check('a long article is capped', narrowToRelational(long, CAST).length <= 6000);
}
{
  /**
   * The narrowed text is the haystack the evidence check searches, so a quote taken from a kept
   * sentence has to still be findable in the output. These two are one mechanism, not two.
   */
  const article = "Jon Snow, raised at Winterfell beside them, is introduced as Eddard's illegitimate son.";
  const narrowed = narrowToRelational(article, CAST);
  const { edges } = verifyTree(
    [{ from: 0, to: 6, kind: 'parent', evidence: quote.jon }],
    { castSize: CAST.length, source: narrowed },
  );
  check('a quote from a kept sentence still verifies against the narrowed source', edges.length === 1);
}

/**
 * Seeding, which is where a generated tree meets somebody's actual library.
 *
 * The rule under test throughout: the user's own work is never touched. A seed that overwrites a
 * line someone drew is not a foundation, it is a stranger rearranging their notes.
 */
console.log('seeding a library');

const EP = '1_Ep 1';
const member = (id: string, name: string, rels: MapRelationship[] = []): CastMember =>
  ({ id, name, nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: '',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', relByEp: { [EP]: rels } } as CastMember);
const relsFor = (c: CastMember) => c.relByEp?.[EP] || [];

const tree = (edges: FamilyTree['edges'], names = CAST): FamilyTree => ({
  edges, names, season: 1, asOfEpisode: 1,
  sourceUrl: 'https://en.wikipedia.org/wiki/x', modelVersion: 'test', generatedAt: '',
});

{
  const library = [member('n', 'Eddard Stark'), member('r', 'Robb Stark'), member('s', 'Sansa Stark')];
  // CAST[0] is Eddard and CAST[3] is Sansa — indices into the list the model was given, not ids.
  const plan = planSeed(tree([{ from: 0, to: 3, kind: 'parent', evidence: quote.children }]), library, relsFor);

  check('a parent link is written once, on the parent', plan.writes.length === 1 && plan.writes[0].castId === 'n');
  check('pointing at the child', plan.writes[0].targetId === 's' && plan.writes[0].kind === 'parent');
  check('and carries the label the map already uses for that kind', plan.writes[0].label === 'Parent of');
  check('every character the tree named was found', plan.matched === 3, String(plan.matched));
}
{
  const library = [member('r', 'Robb Stark'), member('a', 'Arya Stark')];
  const plan = planSeed(tree([{ from: 2, to: 4, kind: 'sibling', evidence: quote.children }]), library, relsFor);

  check('a symmetric link is written from both ends, as a drawn one is', plan.writes.length === 2);
  check('but counts as the one line it draws', plan.links === 1, String(plan.links));
  check('so hiding either person cannot make the line vanish',
    plan.writes[0].castId === 'r' && plan.writes[1].castId === 'a');
}
{
  // The user already said how these two are related. Their answer stands, whatever the model says.
  const library = [
    member('n', 'Eddard Stark', [{ id: 'r1', targetId: 'j', label: 'Raised him', kind: 'other' }]),
    member('j', 'Jon Snow'),
  ];
  const plan = planSeed(tree([{ from: 0, to: 6, kind: 'parent', evidence: quote.jon }]), library, relsFor);

  check('a pair the user has already linked is left completely alone', plan.writes.length === 0);
  check('and is counted as skipped, not as missing', plan.skipped.alreadyLinked === 1);
}
{
  const library = [member('n', 'Eddard Stark'), member('j', 'Jon Snow')];
  const plan = planSeed(tree([
    { from: 0, to: 6, kind: 'parent', evidence: quote.jon },
    { from: 0, to: 13, kind: 'extended', evidence: quote.drogo },
  ]), library, relsFor);

  check('a link to someone this library does not have is skipped', plan.writes.length === 1);
  check('and counted', plan.skipped.notInLibrary === 1);
}
{
  // Two records with the same name: seeding either one would be a guess, so seed neither.
  const library = [member('a', 'Robb Stark'), member('b', 'Robb Stark'), member('n', 'Eddard Stark')];
  const plan = planSeed(tree([{ from: 0, to: 2, kind: 'parent', evidence: quote.children }]), library, relsFor);
  check('an ambiguous name is never guessed at', plan.writes.length === 0 && plan.skipped.notInLibrary === 1);
}
{
  // normalizeName absorbs the differences that actually occur between the two lists.
  const library = [member('n', 'Eddard "Ned" Stark'), member('r', 'Robb Stark')];
  const plan = planSeed(tree([{ from: 0, to: 2, kind: 'parent', evidence: quote.children }],
    ['Eddard "Ned" Stark', 'Catelyn Stark', 'Robb Stark']), library, relsFor);
  check('names differing only in punctuation still match', plan.writes.length === 1);
}
{
  const library = [member('n', 'Eddard Stark'), member('r', 'Robb Stark')];
  const twice = tree([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 2, to: 0, kind: 'sibling', evidence: quote.children },
  ]);
  const plan = planSeed(twice, library, relsFor);
  check('one pair gets one seeded link even when the tree proposes two', plan.writes.length === 1);
}
{
  /**
   * How a redraw works: the caller hides the previous suggestion from `relsFor`, so a pair linked
   * only by an earlier seed is open again, while a pair the user drew stays closed. Both halves of
   * that are the same one rule — the plan blocks on whatever it is shown.
   */
  const seeded: MapRelationship = { id: 'r1', targetId: 'r', label: 'Parent of', kind: 'parent', auto: true };
  const mine: MapRelationship = { id: 'r2', targetId: 's', label: 'Raised her', kind: 'other' };
  const library = [member('n', 'Eddard Stark', [seeded, mine]), member('r', 'Robb Stark'), member('s', 'Sansa Stark')];
  const asked = tree([
    { from: 0, to: 2, kind: 'parent', evidence: quote.children },
    { from: 0, to: 3, kind: 'parent', evidence: quote.children },
  ]);

  const blocked = planSeed(asked, library, relsFor);
  check('a redraw that is shown every line adds nothing', blocked.writes.length === 0);

  const redraw = planSeed(asked, library, (c) => relsFor(c).filter((r) => !r.auto));
  check('hiding the previous suggestion frees that pair to be drawn again', redraw.links === 1);
  check('and the line the user wrote themselves still blocks its pair',
    redraw.writes.every((w) => w.targetId !== 's'), JSON.stringify(redraw.writes));
}
{
  const empty = planSeed(tree([]), [member('n', 'Eddard Stark')], relsFor);
  check('an empty tree plans no writes and is not an error', empty.writes.length === 0);
}

console.log('what reaches the browser');
{
  /**
   * The quotes are the most spoiler-dense text this feature touches — the sentence proving Eddard
   * is Sansa's father, in a series-wide article, is the one about his execution. They are needed to
   * verify and kept to audit; they must not be shipped.
   */
  const spoilery = tree([{ from: 0, to: 3, kind: 'parent', evidence: "Joffrey orders Ned's execution for his own amusement" }]);
  const sent = stripEvidence(spoilery);

  check('no quotation reaches the client', sent.edges.every((e) => e.evidence === undefined));
  check('but the link itself survives intact',
    sent.edges[0].from === 0 && sent.edges[0].to === 3 && sent.edges[0].kind === 'parent');
  check('and the stored tree still has its quotes to audit', spoilery.edges[0].evidence !== undefined);
  check('everything else about the tree is unchanged', sent.names === spoilery.names && sent.asOfEpisode === 1);
}
{
  // Stripping is for the response only. An edge arriving without a quote is still unverifiable.
  const { edges } = run([{ from: 0, to: 2, kind: 'parent' }]);
  check('an edge with no quote never verifies in the first place', edges.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
