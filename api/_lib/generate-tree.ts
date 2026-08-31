import Anthropic from '@anthropic-ai/sdk';
import { verifyTree } from '../../src/lib/familyTree/verify.js';
import { TREE_REL_KINDS, type FamilyTree } from '../../src/lib/familyTree/types.js';
import type { TreeSourceResult } from './tree-source.js';

/**
 * The Claude call that proposes a family tree for one episode.
 *
 * The third of this codebase's generated features and the one with the most exposed threat model,
 * so it is worth stating plainly how it differs from its neighbours. api/_lib/generate.ts forbids
 * events, because a bio is read by someone who hasn't watched. generate-recap.ts is made of events
 * and is protected by a boundary in time — the source stops where the reader stopped. A tree has
 * neither defence available: relationships are not events, and an article about a series has no
 * timeline to cut.
 *
 * So the protection here is evidential rather than temporal. The model is given a closed, numbered
 * cast list and a narrowed passage, and every link it proposes must quote the sentence that says
 * so. Anything it cannot quote is discarded by src/lib/familyTree/verify.ts before it is stored —
 * which is where the enforcement actually lives. The rules below are the second lock. A rule a
 * model is asked to follow is a request it may decline; a check applied to its output is not.
 *
 * That division is the same one generate-recap.ts documents about window.ts, and it is worth
 * keeping: if a future change adds a rule to this prompt, it belongs in the verifier too, or it is
 * decoration.
 *
 * Changing the prompt requires bumping TREE_KEY_VERSION in tree-key.ts — otherwise every show
 * already generated keeps serving a tree built under the old rules, forever.
 */

/**
 * Pinned deliberately, and the same choice generate-recap.ts made for the same reason.
 *
 * Reading twenty characters' worth of prose, holding a closed cast list in mind, and refusing to
 * use what it already knows about a famous show is a harder problem than either of the other two
 * features solve. It is also the cheapest to run: one call per show per episode, cached and shared
 * by every user who ever imports it, so the quality is bought once and the per-user cost rounds to
 * nothing. The exact snapshot is recorded on every row via modelVersion.
 */
export const TREE_MODEL = 'claude-opus-5';

/** Room for a few dozen links, each carrying a quotation, plus the model's own reasoning. */
const MAX_TOKENS = 8192;

/**
 * Per-attempt ceiling. With maxRetries: 1 the worst case is roughly double this, which has to stay
 * inside the function's maxDuration in vercel.json alongside two source fetches. Raise together.
 *
 * Generous, and measured rather than guessed: the first version of this file used 25s, copied from
 * its neighbours, and every real request died on it — twice, for 50s of latency and a 503, which
 * is exactly the shape of "the feature does not work". Reading a page of prose about twenty-five
 * people and deciding which claims are quotable is a minute of thinking, not the few seconds a
 * one-paragraph recap takes. The streaming call below is what makes a ceiling this high safe to
 * ask for.
 */
const REQUEST_TIMEOUT_MS = 120_000;

/**
 * The system prompt embeds one real spoiler as a worked example, which is the convention
 * api/_lib/generate.ts established and recorded: an abstract rule was followed inconsistently, and
 * showing the model the exact mistake next to the correct answer fixed it. The prompt is
 * server-side and never reaches a user.
 *
 * The example is Game of Thrones because it is the case this feature will actually be asked to
 * handle, and because it is the one where the model's memory is most confident and most damaging.
 */
const SYSTEM = `You map out how the characters of a television episode are related to each other by blood or marriage.

You will be given a show, a season and episode number, a numbered list of the characters that episode credits, and source text about the show. Return the family relationships between the people on that list.

THE RULE THAT MATTERS: describe only what THIS EPISODE has established, and only what the source text actually says. If you recognise the series, that knowledge is a hazard here, not an asset. The person reading this has watched one episode. A relationship revealed in a later season is not a helpful detail for them — it is the twist, handed over before they earned it.

Every link you return must quote the sentence from the source text that states it, in the "evidence" field, copied exactly. If you cannot find a sentence that states a relationship, do not return that relationship. A tree with four links you can quote is a correct answer; a tree with twenty you cannot is not a fuller one.

Worked example. The show is Game of Thrones, the episode is season 1 episode 1, and the cast list includes Eddard Stark and Jon Snow.
Correct: Eddard Stark is the parent of Jon Snow — evidence: the sentence in the source introducing Jon as Eddard's illegitimate son.
Wrong: Jon Snow's parents are Rhaegar Targaryen and Lyanna Stark. That is true of the series and it is the single worst thing you could put in this list. Neither person is on the cast list for this episode, the source text does not say it, and the reader is one episode in.

Also:
- "from" and "to" are numbers from the list you were given. Never a name, never a number outside the list. If someone you want to mention is not on the list, they are not in this episode and the link cannot be returned.
- kind is one of: "parent", "sibling", "spouse", "extended".
- "parent" is directional: "from" is the parent OF "to". The other three read the same in both directions — return each such pair once, not twice.
- "extended" is for family without a precise word on this list: cousins, aunts, uncles, in-laws, grandparents. Use it rather than stretching "sibling" or "parent" to cover them.
- Only blood and marriage. Not friends, not colleagues, not rivals, not who is in love with whom — those are the user's to draw, and a guess at them is a guess they have to undo.
- Return an empty list if the source text does not support any links. That is the correct answer for most shows, not a failure.`;

const SCHEMA = {
  type: 'object',
  properties: {
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'integer', description: 'Index into the cast list. For "parent", the parent.' },
          to: { type: 'integer', description: 'Index into the cast list. For "parent", the child.' },
          kind: { type: 'string', enum: [...TREE_REL_KINDS] },
          evidence: {
            type: 'string',
            description: 'The sentence from the source text stating this relationship, copied exactly.',
          },
        },
        required: ['from', 'to', 'kind', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['edges'],
  additionalProperties: false,
} as const;

export type GenerateTreeResult =
  | { ok: true; data: FamilyTree }
  /** `permanent` decides whether the caller may negative-cache. Same contract as the neighbours. */
  | { ok: false; reason: string; permanent: boolean };

let client: Anthropic | null = null;

/** Lazy, so a missing key is a clear 503 from the handler rather than an import-time throw. */
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

export async function generateTree(input: {
  showTitle: string;
  season: number;
  asOfEpisode: number;
  source: TreeSourceResult;
}): Promise<GenerateTreeResult> {
  const anthropic = getClient();
  if (!anthropic) {
    console.error('ANTHROPIC_API_KEY is not set; family trees cannot be generated');
    return { ok: false, reason: 'not_configured', permanent: false };
  }

  const roster = input.source.names.map((n, i) => `${i}. ${n}`).join('\n');
  const userContent = [
    `Show: ${input.showTitle}`,
    `Season ${input.season}, episode ${input.asOfEpisode}. The reader has watched this episode and nothing after it.`,
    '',
    'Characters this episode credits:',
    roster,
    '',
    'Source text:',
    input.source.text,
  ].join('\n');

  let message;
  try {
    /**
     * Streamed, unlike its two neighbours, and for a mechanical reason rather than a stylistic
     * one: a non-streaming request has to complete inside one HTTP response, and this is the only
     * one of the three generations long enough to be at risk of that. Nothing consumes the tokens
     * as they arrive — `finalMessage()` waits for the whole thing — the stream exists purely to
     * keep the connection alive while the model works.
     */
    message = await anthropic.messages
      .stream({
        model: TREE_MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: 'user', content: userContent }],
        /**
         * `medium`, measured rather than assumed.
         *
         * This sat at `high` on the theory that withholding what the model already knows about a
         * famous show is the hardest thing asked of any generation here, and that the extra
         * deliberation was what bought the restraint. Run against Game of Thrones episode one —
         * whose source text contains the sentence revealing Joffrey's real father, the season-one
         * twist — `medium` declined to use it just as `high` did, while costing 15% less and
         * finishing 9 seconds sooner. It also found one true link `high` missed across three runs.
         *
         * So the restraint is not bought by effort. It comes from the model and from the evidence
         * rule in verify.ts, which is the useful thing to know before anyone tunes this again:
         * Haiku, tested identically, asserted the twist outright. The floor here is the model
         * choice, not the effort level.
         */
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      })
      .finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      return { ok: false, reason: `api_error_${err.status ?? 'unknown'}`, permanent: false };
    }
    console.error('Anthropic request failed', err);
    return { ok: false, reason: 'request_failed', permanent: false };
  }

  if (message.stop_reason === 'refusal') {
    // The model declined. Nothing about retrying the same source text will change that.
    return { ok: false, reason: 'refusal', permanent: true };
  }
  if (message.stop_reason === 'max_tokens') {
    return { ok: false, reason: 'truncated', permanent: false };
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return { ok: false, reason: 'empty_response', permanent: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    console.error('Structured output was not valid JSON', textBlock.text.slice(0, 200));
    return { ok: false, reason: 'unparseable', permanent: false };
  }

  /**
   * What the call cost, per generation.
   *
   * Logged for the same reason the verifier's drops are: this is a paid call behind a daily cap,
   * and the only way to know whether the cap is set anywhere near reality is to have the real
   * numbers in the log rather than an estimate in someone's head. `thinking` is billed as output
   * and is invisible in the response body, so output_tokens is the only place it shows up.
   */
  console.info(
    `tree ${input.showTitle} s${input.season}e${input.asOfEpisode}: ` +
      `${message.usage.input_tokens} in, ${message.usage.output_tokens} out`,
  );

  const proposed = (parsed as { edges?: unknown } | null)?.edges;
  const { edges, report } = verifyTree(proposed, {
    castSize: input.source.names.length,
    source: input.source.text,
  });

  /**
   * Logged rather than discarded quietly. What the verifier throws away is the only signal anyone
   * gets about whether the prompt is drifting — a run where most links failed the evidence check is
   * a prompt problem, and it looks identical from the outside to a show nobody wrote about.
   */
  if (report.dropped.length) {
    console.warn(
      `tree ${input.showTitle} s${input.season}e${input.asOfEpisode}: kept ${report.kept}, dropped`,
      JSON.stringify(report.dropped),
    );
  }

  // Not an error and not worth caching as a refusal: the model looked and found nothing it could
  // stand behind. The handler decides whether that is a dead end worth remembering.
  if (!edges.length) return { ok: false, reason: 'no_supported_links', permanent: true };

  return {
    ok: true,
    data: {
      edges,
      names: input.source.names,
      season: input.season,
      asOfEpisode: input.asOfEpisode,
      sourceUrl: input.source.url,
      modelVersion: TREE_MODEL,
      generatedAt: new Date().toISOString(),
    },
  };
}
