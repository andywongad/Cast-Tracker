import Anthropic from '@anthropic-ai/sdk';
import type { Recap } from '../../src/lib/recap/types.js';
import { repairModelEscapes } from '../../src/lib/recap/text.js';
import type { RecapSourceResult } from './recap-source.js';

/**
 * The Claude call that turns a season's episode summaries into a "previously on" recap.
 *
 * This is the inverse of api/_lib/generate.ts. That prompt forbids events, because a cast bio is
 * read by someone who hasn't watched yet. This one is made of events — a recap that avoids plot is
 * useless — and its safety comes from a boundary in time instead: the source text stops at the
 * last episode the reader has watched, and the model is told the source is the edge of the world.
 *
 * The real enforcement is in src/lib/recap/window.ts, which filters the episode list before it is
 * ever sent. The rule below is the second lock, not the first.
 *
 * As in enrichment, the schema is enforced via output_config.format rather than requested in the
 * prompt, and the fields the model doesn't get to decide (sourceUrl, modelVersion, generatedAt,
 * the episode range) are filled in here from facts already held.
 *
 * Changing the prompt requires bumping RECAP_KEY_VERSION in recap-key.ts — otherwise every episode
 * already generated keeps serving text written under the old rules, forever.
 */

/**
 * Pinned deliberately, and a step up from the bio model.
 *
 * Deciding what to leave out of a season is a harder problem than compressing one paragraph, and
 * the recap is the part of this feature a user actually reads end to end. Because the result is
 * cached per episode and shared by every reader who reaches it, the quality is bought once and the
 * per-user cost of the better model rounds to nothing. The exact snapshot is recorded on every row
 * via modelVersion.
 */
export const RECAP_MODEL = 'claude-opus-5';

/**
 * Room for a paragraph, a few beats, and the model's own reasoning — thinking is on by default on
 * this model and is billed out of the same ceiling.
 */
const MAX_TOKENS = 4096;

/**
 * Per-attempt ceiling. With maxRetries: 1 the worst case is roughly double this, which has to stay
 * inside the function's maxDuration in vercel.json alongside the TMDb fetch. Raise both together
 * or neither.
 */
const REQUEST_TIMEOUT_MS = 20_000;

const SYSTEM = `You write short "previously on" recaps for someone about to watch the next episode of a television show.

You will be given a show, a season, and summaries of the episodes that have already been watched, in order. Everything you are given has already been seen by the reader. Your job is to remind them what happened.

This is not a spoiler-free description. Events are the point: what happened, what changed, who did what to whom, and where everyone stands now. A recap that avoids plot is useless.

THE RULE THAT MATTERS: the source text is the edge of the world. Write only about what is in it. Never mention, hint at, tease, or set up anything that happens after the last episode you were given — not from the source, and above all not from your own knowledge of this show. If you recognise the series, that knowledge is a hazard here, not an asset. The reader has watched exactly these episodes and no more, and they are about to watch the next one.

Worked example. You are given episodes 1 through 3, in which a detective is assigned a case and quietly begins keeping evidence off the record.
Correct: "Reyes caught the Delgado case and, by the third episode, had started keeping pieces of it off the books."
Wrong: "Reyes caught the Delgado case and began hiding evidence — a habit that catches up with her." That last clause is not in the source. It is a tease about an episode the reader has not watched, and preventing it is the whole reason this prompt exists.

Also:
- Write in the past tense, to someone who watched these episodes weeks or months ago and has forgotten the details.
- Write continuous prose, not an episode-by-episode list. Do not number episodes or say "in episode four".
- Three to six sentences. If the source is thin, write less. Never pad with invention — a short recap is the correct answer for a season the summaries barely describe, not a failure.
- Use character names exactly as the source spells them. If the source only describes someone by role, describe them by role too; do not guess a name.
- Write about the characters and the story, never the actors, the writers, or how the show was made.
- beats: the two to four things most worth having in mind before pressing play, one short line each — under about 70 characters, no trailing full stop. These are read at a glance by someone whose show is already loading. Order them by what matters most, not chronologically. If the source supports fewer than two, return fewer.`;

const SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description: 'The recap itself: three to six sentences of continuous prose, past tense.',
    },
    beats: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Two to four short lines, each one thing worth remembering before the next episode. Fewer if the source does not support more.',
    },
  },
  required: ['text', 'beats'],
  additionalProperties: false,
} as const;

export type GenerateRecapResult =
  | { ok: true; data: Recap }
  /** `permanent` decides whether the caller may negative-cache. Same contract as enrichment. */
  | { ok: false; reason: string; permanent: boolean };

let client: Anthropic | null = null;

/** Lazy, so a missing key is a clear 503 from the handler rather than an import-time throw. */
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  return client;
}

/** Long enough for a real line, short enough that a bad response can't push a wall of text. */
const MAX_BEAT_LENGTH = 120;
const MAX_BEATS = 4;

/**
 * Validate even though the schema is API-enforced. This is the boundary between someone else's
 * output and data that will be served to every future viewer of this episode.
 */
function toRecap(raw: unknown, input: { season: number; throughEpisode: number; source: RecapSourceResult }): Recap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // repairModelEscapes before length checks: an escape sequence that survived parsing is several
  // characters of nothing, and trimming to a cap around it would cut mid-sequence.
  const text = typeof r.text === 'string' ? repairModelEscapes(r.text) : '';
  if (!text) return null;

  const beats = (Array.isArray(r.beats) ? r.beats : [])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => repairModelEscapes(b).slice(0, MAX_BEAT_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_BEATS);

  return {
    text,
    beats,
    season: input.season,
    throughEpisode: input.throughEpisode,
    episodesCovered: input.source.episodesCovered,
    sourceUrl: input.source.url,
    modelVersion: RECAP_MODEL,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateRecap(input: {
  showTitle: string;
  season: number;
  throughEpisode: number;
  source: RecapSourceResult;
}): Promise<GenerateRecapResult> {
  const anthropic = getClient();
  if (!anthropic) {
    console.error('ANTHROPIC_API_KEY is not set; recaps cannot be generated');
    return { ok: false, reason: 'not_configured', permanent: false };
  }

  const userContent = [
    `Show: ${input.showTitle}`,
    `Season: ${input.season}`,
    `The reader has watched through episode ${input.throughEpisode} of this season. Nothing after it.`,
    '',
    'Source text:',
    input.source.text,
  ].join('\n');

  let message;
  try {
    message = await anthropic.messages.create({
      model: RECAP_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      // `medium` rather than the default `high`: the task is bounded and the source is short, and
      // the saving is taken on every episode of every show anyone ever recaps.
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    });
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

  const recap = toRecap(parsed, input);
  if (!recap) return { ok: false, reason: 'failed_validation', permanent: false };

  return { ok: true, data: recap };
}
