/**
 * What `?add=` accepts. Same shape as the other suites — no framework, run with `npm test`.
 *
 * This parses a value that arrives from outside: a link someone pasted, a crawler following a
 * page, a URL edited by hand. The cases below are mostly about what it must refuse, because the
 * id goes straight into a TMDb lookup and then into a form the user is asked to save.
 */
import { parseAddParam } from './addFromUrl';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('what ?add= accepts');
{
  check('a plain id', parseAddParam('?add=1399') === 1399);
  check('alongside other params', parseAddParam('?foo=1&add=76331&bar=2') === 76331);
  check('without the leading ?', parseAddParam('add=1399') === 1399);
}

console.log('and what it refuses');
{
  check('nothing at all', parseAddParam('') === null);
  check('a different param', parseAddParam('?show=s-demo-bear') === null);
  check('an empty value', parseAddParam('?add=') === null);
  /** Number.parseInt would read this as 12 and look up somebody else's show. */
  check('digits with a tail', parseAddParam('?add=12abc') === null);
  check('a negative', parseAddParam('?add=-5') === null);
  check('a zero', parseAddParam('?add=0') === null);
  check('a decimal', parseAddParam('?add=1.5') === null);
  check('a word', parseAddParam('?add=rickroll') === null);
  check('whitespace', parseAddParam('?add=%20') === null);
  /** Not a TMDb id, and long enough to be someone leaning on the endpoint. */
  check('an absurd length', parseAddParam('?add=12345678901234') === null);
  check('a path traversal attempt', parseAddParam('?add=../../etc/passwd') === null);
  check('markup', parseAddParam('?add=<script>') === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
