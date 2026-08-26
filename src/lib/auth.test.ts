/**
 * Sign-in failure copy. Run with `npm test`.
 *
 * Two limits arrive through the same error channel and want opposite advice: one means "a code is
 * already in your inbox", the other means "wait, and there is nothing you can do". Telling someone
 * to check an inbox the mail never reached is worse than showing them the raw error, so the
 * distinguishing cases are the ones worth asserting.
 */
import { signInErrorMessage } from './auth';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

console.log('signInErrorMessage');
{ // the per-address floor: a code exists already, and the wait is short
  const out = signInErrorMessage({ message: 'For security purposes, you can only request this after 47 seconds.', status: 429 });
  check('per-address wait sends you to your inbox', /check your inbox/i.test(out), out);
  check('and quotes the actual seconds remaining', out.includes('47 seconds'), out);
  check('without mentioning the hourly cap', !/hour/i.test(out), out);
}
{ // the project's hourly ceiling: nothing was sent, and it is not the user's fault
  const out = signInErrorMessage({ message: 'Email rate limit exceeded', status: 429 });
  check('hourly cap says whose limit it is', /limit on the app/i.test(out), out);
  check('says when to come back', /try again in an hour/i.test(out), out);
  check('does not send them to an empty inbox', !/check your inbox/i.test(out), out);
  check('reassures that the account is fine', /nothing is wrong/i.test(out), out);
}
{ // matched on the error code alone, since the wording is Supabase's to change
  const out = signInErrorMessage({ message: 'something opaque', code: 'over_email_send_rate_limit' });
  check('the error code alone is enough', /limit on the app/i.test(out), out);
}
{ // anything else passes through rather than being flattened into a generic apology
  check('an unrelated error keeps its own message',
    signInErrorMessage({ message: 'Enter a valid email address.' }) === 'Enter a valid email address.');
  check('an empty error still says something', signInErrorMessage({}).length > 10);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
