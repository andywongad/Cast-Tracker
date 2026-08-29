/**
 * The recap spoiler boundary. Same shape as the other suites — no framework, run with `npm test`.
 *
 * Only one of these tests is really about correctness; the rest are about a promise. If
 * `episodesThrough` ever lets an episode past the boundary through, the app tells someone what
 * happens in the episode they are about to watch, in a sheet they opened to avoid exactly that.
 * So the cases that matter here are the ones asserting what must NOT be in the source text.
 */
import { buildRecapSource, episodesThrough, lastEpisodeNumber } from './recap/window';
import type { RecapEpisode } from './recap/window';
import { repairModelEscapes } from './recap/text';

const ep = (number: number, overview = `Something substantial happened in episode ${number}. `.repeat(8), name = `Ep ${number}`): RecapEpisode =>
  ({ number, name, overview });

const season = (count: number): RecapEpisode[] => Array.from({ length: count }, (_, i) => ep(i + 1));

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('episodesThrough');
{
  const eps = season(10);
  const got = episodesThrough(eps, 4);
  check('stops at the boundary', got.length === 4);
  check('the boundary episode is included', got.some((e) => e.number === 4));
  check('nothing after the boundary survives', got.every((e) => e.number <= 4), JSON.stringify(got.map((e) => e.number)));
}
{ // TMDb returns episodes in order today; nothing here may depend on that
  const shuffled = [ep(5), ep(1), ep(9), ep(3), ep(2)];
  const got = episodesThrough(shuffled, 3);
  check('out-of-order input is still bounded', got.every((e) => e.number <= 3));
  check('out-of-order input comes back in order', got.map((e) => e.number).join() === '1,2,3');
}
{
  check('a boundary of 0 yields nothing', episodesThrough(season(6), 0).length === 0);
  check('specials and junk episode numbers are dropped', episodesThrough([ep(0), ep(-1), ep(2)], 5).map((e) => e.number).join() === '2');
}

console.log('lastEpisodeNumber');
{
  check('finds the final episode', lastEpisodeNumber(season(13)) === 13);
  check('an empty season has no last episode', lastEpisodeNumber([]) === 0);
}

console.log('buildRecapSource');
{
  const built = buildRecapSource({ season: 2, seasonOverview: 'The family regroups.', episodes: season(10), throughEpisode: 4 });
  check('a normal season builds source', !!built);
  check('it reports what it actually covered', built?.episodesCovered === 4, String(built?.episodesCovered));
  check('episodes up to the boundary are in the text', !!built && built.text.includes('episode 4'));
  // The one that matters.
  check('no episode past the boundary is in the text', !!built && !built.text.includes('episode 5') && !built.text.includes('Ep 5'), built?.text.slice(0, 200));
}

/**
 * The season blurb describes the whole season, so mid-season it is a spoiler. Caught on real data:
 * The Bear S4 has 19-character episode overviews next to a 385-character season summary, which was
 * both clearing the "enough source" floor on its own and describing episodes 7-10 to someone at 6.
 */
console.log('buildRecapSource — the season blurb');
{
  const mid = buildRecapSource({ season: 2, seasonOverview: 'By the finale the family has fallen apart.', episodes: season(10), throughEpisode: 4 });
  check('mid-season, the season blurb is held back', !!mid && !mid.text.includes('fallen apart'), mid?.text.slice(0, 120));

  const end = buildRecapSource({ season: 2, seasonOverview: 'By the finale the family has fallen apart.', episodes: season(10), throughEpisode: 10 });
  check('at the season end, the season blurb is included', !!end && end.text.includes('fallen apart'));
}
{ // The Bear S4 in miniature: a real season blurb over episode overviews that say nothing
  const thin = Array.from({ length: 10 }, (_, i) => ep(i + 1, ['Opportunity.', 'Gears start to turn.', 'Dogs.'][i % 3]));
  const blurb = 'A long, substantial season summary that runs well past four hundred characters. '.repeat(6);
  const built = buildRecapSource({ season: 4, seasonOverview: blurb, episodes: thin, throughEpisode: 6 });
  check('a rich blurb cannot carry a season of empty overviews', built === null, built?.text.slice(0, 120));
  check('the same season is recappable once finished', !!buildRecapSource({ season: 4, seasonOverview: blurb, episodes: thin, throughEpisode: 10 }));
}
{ // The Bear: overviews of a few words each, nothing to recap and nothing to invent from
  const thin = [ep(1, 'Opportunity.'), ep(2, 'Gears start to turn.'), ep(3, 'Dogs.')];
  check('a season of one-word overviews is unavailable', buildRecapSource({ season: 4, seasonOverview: '', episodes: thin, throughEpisode: 3 }) === null);
}
{
  check('an empty season is unavailable', buildRecapSource({ season: 1, seasonOverview: 'A rich blurb '.repeat(40), episodes: [], throughEpisode: 5 }) === null);
  check('a boundary before episode 1 is unavailable', buildRecapSource({ season: 1, seasonOverview: '', episodes: season(8), throughEpisode: 0 }) === null);
}
{ // an episode with no overview still belongs in the list, so the numbering has no holes
  const gappy = [ep(1), ep(2, ''), ep(3)];
  const built = buildRecapSource({ season: 1, seasonOverview: '', episodes: gappy, throughEpisode: 3 });
  check('an episode with no summary is still listed', !!built && built.text.includes('Episode 2'));
  check('but it is not counted as covered', built?.episodesCovered === 2, String(built?.episodesCovered));
}
{ // a long season must stay inside the budget, and must drop the oldest rather than the newest
  const long = Array.from({ length: 24 }, (_, i) => ep(i + 1, `Episode ${i + 1} recap text. `.repeat(60)));
  const built = buildRecapSource({ season: 1, seasonOverview: '', episodes: long, throughEpisode: 24 });
  check('a long season is trimmed to budget', !!built && built.text.length <= 12_000, String(built?.text.length));
  check('the episode before the boundary survives trimming', !!built && built.text.includes('Episode 24'));
  check('the oldest episodes are what gets dropped', !!built && !built.text.includes('Episode 1\n'));
}

/**
 * Both inputs below are verbatim from the first real generation this feature ran. Structured
 * output guaranteed the JSON parsed; it did not guarantee the text inside was clean.
 */
console.log('repairModelEscapes');
{
  check('a surviving unicode escape is decoded', repairModelEscapes('Dr. Melfi \\u2014 and had her investigated') === 'Dr. Melfi — and had her investigated');
  check('a stray backslash is dropped', repairModelEscapes('at home and at work \\ Carmela, Meadow') === 'at home and at work Carmela, Meadow');
  check('escaped quotes come through as quotes', repairModelEscapes('Makazian said he \\"was wired\\" for the Feds') === 'Makazian said he "was wired" for the Feds');
  check('clean text is left alone', repairModelEscapes('Tuco — a standoff Hank walked into.') === 'Tuco — a standoff Hank walked into.');
  check('an em dash already decoded survives', repairModelEscapes('Jackie is dying — Junior suspects Tony') === 'Jackie is dying — Junior suspects Tony');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
