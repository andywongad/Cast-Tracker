/**
 * The air day and time shown in an episode notification. Same shape as the other suites — no
 * framework, run with `npm test`.
 *
 * Two things are under test. src/lib/airTime.ts is the canonical formatter, used by the alert
 * card. public/service-worker.js carries a copy of it inline, because a service worker is served
 * verbatim and cannot import from the bundle — so the last block here runs both over the same
 * table and fails if they ever disagree. Without that, the notification and the card could drift
 * into telling the same person two different things about the same episode.
 *
 * The worker's copy is read out of the file and evaluated, which is unusual enough to justify:
 * this is date arithmetic across timezones with one genuinely dangerous case in it, and the
 * alternative was no coverage at all. If the extraction stops matching, this fails loudly rather
 * than silently testing nothing.
 *
 * The dangerous case is `exact: false`. api/_lib/schedule.ts reads a date-only upstream as
 * midnight UTC, and midnight UTC is the *previous evening* anywhere west of Greenwich — so a
 * local rendering names the wrong day, confidently. The timezone below is pinned west on purpose.
 */
process.env.TZ = 'America/Los_Angeles';

import { readFileSync } from 'node:fs';
import { airWords as canonical } from './airTime';

const source = readFileSync('public/service-worker.js', 'utf8');
const extracted = /function airWords\([\s\S]*?\n}/.exec(source);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('airWords (extracted from public/service-worker.js)');
if (!extracted) {
  check('airWords was found in the service worker', false, 'the function was renamed or reshaped — fix this extraction');
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(1);
}

const worker = new Function(`${extracted[0]}; return airWords;`)() as (
  airsAt: unknown, exact: unknown, now: number,
) => string;

/** The cases below run against the canonical copy; the last block holds the worker's to it. */
const airWords = canonical;

/** Thursday 3 September 2026, 2:00 PM Pacific. */
const now = Date.parse('2026-09-03T21:00:00Z');
const at = (iso: string, exact: boolean) => airWords(Date.parse(iso), exact, now);

{
  /**
   * Guard, not a feature test. The inexact case below only bites west of Greenwich, so on a
   * machine running in UTC — which is CI's default — it would pass while proving nothing. If this
   * fails, the TZ assignment at the top of this file stopped taking effect and the next two
   * assertions are worthless.
   */
  const localDay = new Date(Date.parse('2026-09-05T00:00:00Z')).toLocaleDateString(undefined, { day: 'numeric' });
  check('the suite is running west of UTC, or the next case proves nothing', localDay === '4', `local day was ${localDay}`);
}

{ // a date-only upstream must not be dressed up as a time
  const out = at('2026-09-05T00:00:00Z', false);
  check('inexact shows no clock time', !/\d:\d/.test(out), out);
  // The whole point. Locally this instant is Friday the 4th; the honest answer is what TMDb said.
  check('inexact names the UTC day, not the local one', out.includes('5') && !out.includes('4'), out);
}

{ // an exact timestamp is the reader's local time, which is why this is formatted on the device
  const tonight = at('2026-09-04T04:00:00Z', true); // 9:00 PM Pacific, same calendar day
  const expected = new Date(Date.parse('2026-09-04T04:00:00Z'))
    .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  check('same day shows the time alone', tonight === expected, tonight);

  const tomorrow = at('2026-09-05T04:00:00Z', true);
  check('another day carries a day as well as a time', tomorrow !== expected && tomorrow.endsWith(expected), tomorrow);

  // An episode broadcast at 9pm Eastern is 6pm for this reader, and 6pm is what they need to see.
  const eastern = at('2026-09-04T01:00:00Z', true);
  check('a distant broadcast time is converted, not repeated', eastern.includes('6:00'), eastern);
}

{ // a weekday name only means something inside a week
  const soon = at('2026-09-05T04:00:00Z', true);
  const distant = at('2026-09-14T04:00:00Z', true);
  check('a date far out carries more than a weekday', distant.length > soon.length, `${soon} / ${distant}`);
}

{ // everything it cannot state honestly comes back empty, and the body is shown unchanged
  check('an episode already out gets no air time', at('2026-09-03T17:00:00Z', true) === '', at('2026-09-03T17:00:00Z', true));
  check('a payload with no airsAt is silent', airWords(undefined, undefined, now) === '');
  check('a payload with a junk airsAt is silent', airWords('soon', true, now) === '');
  check('an unparseable timestamp is silent', airWords(Number.NaN, true, now) === '');
}

/**
 * The two copies must agree, always. This is the only thing keeping the duplication honest.
 */
console.log('the service worker copy matches src/lib/airTime.ts');
{
  const table: [string, unknown, unknown][] = [
    ['tonight', Date.parse('2026-09-04T04:00:00Z'), true],
    ['tomorrow', Date.parse('2026-09-05T04:00:00Z'), true],
    // Four days out sits between the weekday-only and full-date renderings. Without a case here
    // the table has a hole exactly where the week boundary lives, and a copy that moved it would
    // pass this block — which is what happened the first time this was written.
    ['four days out', Date.parse('2026-09-07T21:00:00Z'), true],
    // Two hours apart, either side of midnight: locks the calendar-date comparison rather than
    // an elapsed-hours one.
    ['late tonight', Date.parse('2026-09-04T06:00:00Z'), true],
    ['just after midnight', Date.parse('2026-09-04T08:00:00Z'), true],
    ['next week', Date.parse('2026-09-14T04:00:00Z'), true],
    ['a date-only upstream', Date.parse('2026-09-05T00:00:00Z'), false],
    ['already aired', Date.parse('2026-09-03T17:00:00Z'), true],
    ['no timestamp', undefined, undefined],
    ['a junk timestamp', 'soon', true],
    ['an unparseable timestamp', Number.NaN, true],
  ];
  let agreed = 0;
  for (const [name, airsAt, exact] of table) {
    const mine = canonical(airsAt, exact, now);
    const theirs = worker(airsAt, exact, now);
    if (mine === theirs) { agreed++; continue; }
    check(`worker agrees on ${name}`, false, `card said ${JSON.stringify(mine)}, worker said ${JSON.stringify(theirs)}`);
  }
  check(`both copies agree on all ${table.length} cases`, agreed === table.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
