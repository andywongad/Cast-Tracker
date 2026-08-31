/**
 * Cutting a series-wide article down to the sentences that can bear on a family tree.
 *
 * The counterpart to src/lib/recap/window.ts, and it exists for the same reason: the recap's real
 * safety is that the episode list is filtered before it is ever sent, not that the prompt asks
 * nicely. A tree cannot filter by time — an article about a television series has no timeline in
 * it — so it filters by shape instead.
 *
 * The shape it filters on: a sentence that states a relationship names two people. "Eddard Stark
 * rules the North alongside his wife Catelyn Stark" names two; "Eddard is executed on the steps of
 * the Great Sept" names one. Keeping only the two-name sentences throws away the overwhelming
 * majority of an article's plot narration for free, without needing to understand any of it, and
 * what survives is disproportionately the "who is who" material a first episode also establishes.
 *
 * That is a heuristic and it is stated as one. It is not a spoiler filter — a two-name sentence
 * about a later season survives it — it is a way of sending less, more relevant text, so the model
 * has less to be tempted by and the evidence check in verify.ts has a smaller haystack to be
 * satisfied from. The locks are still the locks.
 *
 * Pure and import-free, so it can be tested directly and read from both tsconfigs.
 */

/** Below this a "sentence" is a heading, a caption, or a fragment — not a claim about anyone. */
const MIN_SENTENCE_CHARS = 30;

/** Long enough to be a paragraph of prose, short enough not to be a plot summary in disguise. */
const MAX_SENTENCE_CHARS = 400;

/** Bounded so a long article cannot run up token cost. Roughly a page of relationship prose. */
const DEFAULT_MAX_CHARS = 6000;

/**
 * Tokens shorter than this match too much — "Ed", "Jon" is fine but "Al" would hit "also". Three
 * is the shortest length at which a given name is more likely a name than a coincidence.
 */
const MIN_TOKEN_CHARS = 3;

/** Marks a token that more than one cast member answers to, and which therefore identifies nobody. */
const AMBIGUOUS = -1;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"');
}

/**
 * Words, with the possessive taken off.
 *
 * The apostrophe is kept inside a token because "O'Brien" is a name, and stripped from the end
 * because "Cersei's" is a name plus a grammatical ending. That ending is not incidental here: a
 * sentence that states a relationship usually states it possessively — "Cersei's younger brother",
 * "Eddard's illegitimate son" — so treating `cersei's` as a word nobody answers to threw away
 * precisely the sentences this file exists to keep.
 */
function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9']+/)
    .map((t) => t.replace(/'s$|'$/, ''))
    .filter(Boolean);
}

/**
 * Which cast member, if any, each name-token points at.
 *
 * A surname is usually the ambiguous one and that is the useful case: on a show about the Starks,
 * "Stark" identifies nobody, while "Eddard" and "Catelyn" each identify exactly one person. Rather
 * than special-case surnames, count owners per token and discard whatever more than one person
 * answers to — which also handles two characters who share a given name, a case surname-stripping
 * would get wrong in the other direction.
 */
function tokenOwners(names: string[]): Map<string, number> {
  const owners = new Map<string, number>();
  names.forEach((name, i) => {
    const seen = new Set<string>();
    for (const t of tokens(name)) {
      if (t.length < MIN_TOKEN_CHARS || seen.has(t)) continue;
      seen.add(t);
      const prior = owners.get(t);
      if (prior === undefined) owners.set(t, i);
      else if (prior !== i) owners.set(t, AMBIGUOUS);
    }
  });
  return owners;
}

/** Everyone this sentence names, by index, using only tokens that identify one person. */
function peopleIn(sentence: string, names: string[], owners: Map<string, number>): Set<number> {
  const flat = normalize(sentence);
  const found = new Set<number>();

  // Full names first: "Eddard Stark" identifies its owner even when both halves are ambiguous.
  names.forEach((name, i) => {
    if (flat.includes(normalize(name))) found.add(i);
  });

  for (const t of tokens(sentence)) {
    const owner = owners.get(t);
    if (owner !== undefined && owner !== AMBIGUOUS) found.add(owner);
  }
  return found;
}

/**
 * Keep the sentences that name two or more of these people, in the order the article had them.
 *
 * Returns '' when nothing qualifies, which is the normal outcome for a show whose article is a
 * cast list and an air date. The caller treats that as "no source", not as an error.
 */
export function narrowToRelational(
  text: string,
  names: string[],
  opts: { maxChars?: number } = {},
): string {
  if (!text.trim() || names.length < 2) return '';
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const owners = tokenOwners(names);

  // Split on sentence ends, keeping the terminator — the evidence check in verify.ts matches quoted
  // spans against this text, and a quote that includes its full stop must still be findable.
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim());

  const kept: string[] = [];
  let total = 0;
  for (const s of sentences) {
    if (s.length < MIN_SENTENCE_CHARS || s.length > MAX_SENTENCE_CHARS) continue;
    if (peopleIn(s, names, owners).size < 2) continue;
    if (total + s.length + 1 > maxChars) break;
    kept.push(s);
    total += s.length + 1;
  }
  return kept.join(' ');
}
