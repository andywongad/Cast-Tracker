/**
 * How a family tree is arranged on the board. Same shape as the other suites — no framework, run
 * with `npm test`.
 *
 * The board is six columns and unbounded rows, so families stack as bands rather than sitting side
 * by side the way a printed family tree does. That constraint is real and most of what follows is
 * what falls out of it: a band per family, generation as the row, and everyone with no relatives
 * pushed below the lot.
 *
 * The fixture is Game of Thrones — three families of different sizes plus a crowd of people who
 * are nobody's relative, which is the shape a real cast list takes.
 */
import { layoutTree, type LayoutLink } from './familyLayout';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('arranging the tree');

const P = (id: string) => ({ id, name: id });
const link = (aId: string, bId: string, kind: LayoutLink['kind']): LayoutLink => ({ aId, bId, kind });

const CLAN = [
  P('ned'), P('catelyn'), P('benjen'), P('robb'), P('sansa'), P('bran'),
  P('robert'), P('cersei'), P('jaime'), P('joffrey'),
  P('hodor'), P('jorah'),
];
const CLAN_LINKS = [
  link('ned', 'catelyn', 'spouse'),
  link('ned', 'benjen', 'sibling'),
  link('ned', 'robb', 'parent'), link('catelyn', 'robb', 'parent'),
  link('ned', 'sansa', 'parent'), link('catelyn', 'sansa', 'parent'),
  link('ned', 'bran', 'parent'), link('catelyn', 'bran', 'parent'),
  link('robert', 'cersei', 'spouse'),
  link('cersei', 'jaime', 'sibling'),
  link('robert', 'joffrey', 'parent'), link('cersei', 'joffrey', 'parent'),
];

{
  const cells = layoutTree(CLAN, CLAN_LINKS);
  const row = (id: string) => cells[id].r;

  check('everyone handed in gets a cell', Object.keys(cells).length === CLAN.length);
  check('parents sit above their children', row('ned') < row('robb') && row('catelyn') < row('robb'));
  /**
   * A blank row between them, because a "Parent of" label is drawn at the midpoint of its line and
   * a person's name under their face — on adjacent rows those are the same pixels, and the parent
   * generation of every family became unreadable.
   */
  check('with a row between the generations for the line labels', row('robb') - row('ned') === 2,
    String(row('robb') - row('ned')));
  check('spouses share a row', row('ned') === row('catelyn'));
  check('and are placed side by side', Math.abs(cells['ned'].c - cells['catelyn'].c) === 1);
  check('an uncle sits with the parents, not the children', row('benjen') === row('ned'));
  check('siblings share a row', row('robb') === row('sansa') && row('sansa') === row('bran'));
}
{
  const cells = layoutTree(CLAN, CLAN_LINKS);
  const starkRows = ['ned', 'catelyn', 'benjen', 'robb', 'sansa', 'bran'].map((id) => cells[id].r);
  const lannisterRows = ['robert', 'cersei', 'jaime', 'joffrey'].map((id) => cells[id].r);

  check('the two families never share a row',
    starkRows.every((r) => !lannisterRows.includes(r)),
    `${starkRows.join()} vs ${lannisterRows.join()}`);
  check('the bigger family is laid out first', Math.max(...starkRows) < Math.min(...lannisterRows));
  check('with a blank row between them', Math.min(...lannisterRows) - Math.max(...starkRows) === 2);
}
{
  const cells = layoutTree(CLAN, CLAN_LINKS);
  const relatedRows = CLAN.filter((p) => !['hodor', 'jorah'].includes(p.id)).map((p) => cells[p.id].r);

  check('people with no family are moved below everyone who has one',
    cells['hodor'].r > Math.max(...relatedRows) && cells['jorah'].r > Math.max(...relatedRows));
  check('and share a row of their own', cells['hodor'].r === cells['jorah'].r);
  check('set further apart than two families are',
    cells['hodor'].r - Math.max(...relatedRows) === 3, String(cells['hodor'].r - Math.max(...relatedRows)));
}
{
  // Three generations: the grandparents have to land above the parents, not beside them.
  const cells = layoutTree(
    [P('rickard'), P('ned'), P('catelyn'), P('robb')],
    [link('rickard', 'ned', 'parent'), link('ned', 'catelyn', 'spouse'),
     link('ned', 'robb', 'parent'), link('catelyn', 'robb', 'parent')],
  );
  check('grandparents sit above parents, who sit above children',
    cells['rickard'].r < cells['ned'].r && cells['ned'].r < cells['robb'].r);
  check('and marrying in does not drag a spouse up a generation', cells['catelyn'].r === cells['ned'].r);
}
{
  /**
   * A couple who are not married yet are still a couple. Before this, "Partner" was no relation to
   * the layout, so one half stood with the family and the other was filed with the strangers.
   */
  const cells = layoutTree(
    [P('logan'), P('shiv'), P('tom'), P('frank')],
    [link('logan', 'shiv', 'parent'), link('shiv', 'tom', 'romantic')],
  );
  check('an unmarried partner joins the family, as a spouse does', cells['tom'].r === cells['shiv'].r);
  check('and is not left with the people who have nobody', cells['tom'].r < cells['frank'].r);
  check('while a colleague is still nobody\u2019s family',
    layoutTree([P('a'), P('b')], [link('a', 'b', 'colleague')])['a'].r
      === layoutTree([P('a'), P('b')], [link('a', 'b', 'colleague')])['b'].r);
}
{
  // Cousins are peers; an aunt is not. `extended` joins a family without claiming a generation.
  const cells = layoutTree(
    [P('ned'), P('robb'), P('lysa')],
    [link('ned', 'robb', 'parent'), link('lysa', 'robb', 'extended')],
  );
  check('"relative" puts someone in the family', cells['lysa'] !== undefined);
  check('without guessing at their generation', cells['lysa'].r === cells['ned'].r);
}
{
  const wide = Array.from({ length: 8 }, (_, i) => P(`kid${i}`));
  const cells = layoutTree(
    [P('ned'), ...wide],
    wide.map((k) => link('ned', k.id, 'parent')),
  );
  const kidRows = new Set(wide.map((k) => cells[k.id].r));
  check('a generation wider than the board wraps rather than running off it', kidRows.size === 2);
  check('and every column stays on the board',
    Object.values(cells).every((c) => c.c >= 0 && c.c < 6),
    JSON.stringify(Object.values(cells).map((c) => c.c)));
}
{
  const a = layoutTree(CLAN, CLAN_LINKS);
  const b = layoutTree(CLAN, CLAN_LINKS);
  check('the same tree arranges the same way twice', JSON.stringify(a) === JSON.stringify(b));

  const empty = layoutTree([], []);
  check('nothing to arrange is not an error', Object.keys(empty).length === 0);

  const noLinks = layoutTree([P('a'), P('b')], []);
  check('a board with no relationships at all still places everyone',
    Object.keys(noLinks).length === 2 && noLinks['a'].r === noLinks['b'].r);
}
{
  // verify.ts refuses a parent cycle between two people, but marrying into a family twice can
  // still close one once peers are merged. It must terminate and place everyone regardless.
  const cells = layoutTree(
    [P('a'), P('b'), P('c'), P('d')],
    [link('a', 'b', 'parent'), link('b', 'c', 'parent'), link('c', 'd', 'parent'),
     link('a', 'd', 'spouse')],
  );
  check('a cycle in the family graph still lays out, without hanging', Object.keys(cells).length === 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
