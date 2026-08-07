import { CCY_RATES } from './currency';

/**
 * PARKED — intentionally not wired to any component right now.
 *
 * This powered an "Ask" box in the value converter ("How much is 10000 won to usd") that was
 * removed from the UI on purpose, not abandoned mid-build. Nothing imports this file; it is kept
 * so the alias table and tab-disambiguation logic don't have to be rewritten if the feature comes
 * back. To revive it: call `parseMoneyQuery(text)` and push the result into the converter's
 * existing state (tab / amount / currencies / years), then show `describeQuery(q)` so a wrong
 * guess on an ambiguous word is visible.
 *
 * Turns a typed question into converter inputs. Deliberately not an LLM — the grammar people
 * actually use is tiny ("<amount> <currency> to <currency>", "<amount> in <year> today"), so a
 * lookup table plus a couple of regexes covers it deterministically, offline and for free.
 *
 * Known gaps: digits only (no "ten thousand"); limited to the currencies in CCY_RATES; shared
 * symbols resolve to one default ($ -> USD, ¥ -> JPY).
 */

export type MoneyQuery =
  | { kind: 'currency'; amount: number; from: string; to: string }
  | { kind: 'inflation'; amount: number; ccy: string; fromYear: number; toYear: number };

export const MIN_YEAR = 1913;
export const MAX_YEAR = 2026;

/**
 * Spoken names and symbols → ISO code. Longest match wins, so "canadian dollar" is checked
 * before "dollar". Symbols shared by several currencies ($, ¥) resolve to the most common one.
 */
const ALIASES: [string, string][] = [
  ['us dollar', 'USD'], ['american dollar', 'USD'], ['usd', 'USD'], ['bucks', 'USD'], ['buck', 'USD'],
  ['canadian dollar', 'CAD'], ['cad', 'CAD'], ['c$', 'CAD'],
  ['australian dollar', 'AUD'], ['aussie dollar', 'AUD'], ['aud', 'AUD'], ['a$', 'AUD'],
  ['mexican peso', 'MXN'], ['mxn', 'MXN'], ['pesos', 'MXN'], ['peso', 'MXN'],
  ['brazilian real', 'BRL'], ['brl', 'BRL'], ['reais', 'BRL'], ['r$', 'BRL'],
  ['dollars', 'USD'], ['dollar', 'USD'], ['$', 'USD'],
  ['euros', 'EUR'], ['euro', 'EUR'], ['eur', 'EUR'], ['€', 'EUR'],
  ['british pound', 'GBP'], ['pounds', 'GBP'], ['pound', 'GBP'], ['sterling', 'GBP'], ['quid', 'GBP'], ['gbp', 'GBP'], ['£', 'GBP'],
  ['japanese yen', 'JPY'], ['yen', 'JPY'], ['jpy', 'JPY'], ['¥', 'JPY'],
  ['korean won', 'KRW'], ['won', 'KRW'], ['krw', 'KRW'], ['₩', 'KRW'],
  ['chinese yuan', 'CNY'], ['yuan', 'CNY'], ['renminbi', 'CNY'], ['rmb', 'CNY'], ['cny', 'CNY'],
  ['indian rupee', 'INR'], ['rupees', 'INR'], ['rupee', 'INR'], ['inr', 'INR'], ['₹', 'INR'],
];

/** Currency codes in the order they appear in the text, de-duplicated by position. */
function findCurrencies(text: string): { code: string; at: number }[] {
  const hits: { code: string; at: number; len: number }[] = [];
  for (const [alias, code] of ALIASES) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(alias, from);
      if (at === -1) break;
      // Word-ish boundary check so "won" doesn't match inside "wonder".
      const isWordChar = (ch: string) => /[a-z]/.test(ch);
      const before = text[at - 1] ?? ' ';
      // Absorb a trailing plural 's' so "canadian dollars" still matches "canadian dollar"
      // instead of falling through to the bare "dollars" alias.
      let end = at + alias.length;
      if (isWordChar(alias[alias.length - 1]) && text[end] === 's') end += 1;
      const after = text[end] ?? ' ';
      const boundaryOk = !(isWordChar(before) && isWordChar(alias[0])) && !isWordChar(after);
      if (boundaryOk) hits.push({ code, at, len: end - at });
      from = at + alias.length;
    }
  }
  // Longest alias wins where two overlap ("canadian dollar" beats "dollar").
  hits.sort((a, b) => a.at - b.at || b.len - a.len);
  const kept: { code: string; at: number }[] = [];
  let consumedTo = -1;
  for (const h of hits) {
    if (h.at < consumedTo) continue;
    kept.push({ code: h.code, at: h.at });
    consumedTo = h.at + h.len;
  }
  return kept;
}

/** Numbers with optional thousands separators and a k/m multiplier. */
function findNumbers(text: string): { value: number; at: number; raw: string }[] {
  const out: { value: number; at: number; raw: string }[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)\s*([km])?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) continue;
    const mult = m[2]?.toLowerCase() === 'k' ? 1e3 : m[2]?.toLowerCase() === 'm' ? 1e6 : 1;
    out.push({ value: n * mult, at: m.index, raw: m[0] });
  }
  return out;
}

const clampYear = (y: number) => Math.min(MAX_YEAR, Math.max(MIN_YEAR, y));

export function parseMoneyQuery(input: string): MoneyQuery | null {
  const text = ` ${input.toLowerCase().trim()} `;
  if (!text.trim()) return null;

  const currencies = findCurrencies(text);
  const numbers = findNumbers(text);
  if (numbers.length === 0) return null;

  const mentionsNow = /\b(today|now|nowadays|present|current)\b/.test(text);
  // A bare 4-digit number in range reads as a year only when it isn't carrying a k/m suffix.
  const yearHits = numbers.filter((n) => Number.isInteger(n.value) && n.value >= MIN_YEAR && n.value <= MAX_YEAR && !/[km]/i.test(n.raw));

  const uniqueCodes = [...new Set(currencies.map((c) => c.code))];

  // Two currencies named → they want a conversion, even if a number looks year-shaped
  // ("2020 won to usd" is an amount, not a year).
  if (uniqueCodes.length >= 2) {
    const amount = numbers[0].value;
    return { kind: 'currency', amount, from: uniqueCodes[0], to: uniqueCodes[1] };
  }

  // One-or-zero currencies plus a year → an inflation question.
  if (yearHits.length > 0 || mentionsNow) {
    const usedYears = yearHits.map((y) => y.value);
    const amountHit = numbers.find((n) => !yearHits.includes(n));
    if (!amountHit) return null;
    const fromYear = clampYear(usedYears[0] ?? MAX_YEAR);
    const toYear = clampYear(usedYears[1] ?? MAX_YEAR);
    if (fromYear === toYear && usedYears.length < 2 && !mentionsNow) return null;
    return { kind: 'inflation', amount: amountHit.value, ccy: uniqueCodes[0] ?? 'USD', fromYear, toYear };
  }

  // One currency and no year → assume they want it in USD (or out of USD).
  if (uniqueCodes.length === 1) {
    const only = uniqueCodes[0];
    return { kind: 'currency', amount: numbers[0].value, from: only, to: only === 'USD' ? 'EUR' : 'USD' };
  }

  return null;
}

/** Human-readable echo of what the parser decided, so a wrong guess is visible. */
export function describeQuery(q: MoneyQuery): string {
  if (q.kind === 'currency') return `${q.amount.toLocaleString()} ${q.from} → ${q.to}`;
  const label = CCY_RATES[q.ccy]?.symbol ?? '';
  return `${label}${q.amount.toLocaleString()} in ${q.fromYear} → ${q.toYear}`;
}
