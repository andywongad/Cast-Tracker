import Anthropic from '@anthropic-ai/sdk';
import { ROLE_TAGS, type Enrichment, type RoleTag } from '../../src/lib/enrichment/types.js';
import type { SourceText } from './source-wikipedia.js';

/**
 * The Claude call that turns source text into a structured bio.
 *
 * The schema is enforced by the API via output_config.format rather than requested in the prompt.
 * "Return only JSON, no markdown fences" is a request a model can decline; a json_schema is a
 * constraint it cannot violate, which removes the entire class of unparseable-response failures.
 *
 * The model is asked for four fields only. sourceUrl, modelVersion and generatedAt are filled in
 * here from facts we already hold — a model asked to cite its own source will happily invent a
 * convincing URL it never read.
 */

/**
 * The system prompt embeds one real spoiler as a worked example. That's deliberate: an abstract
 * "don't describe events" rule was followed inconsistently, and showing the model a plot-heavy
 * source next to the one-line answer it should produce fixed it. The prompt is server-side and
 * never reaches a user.
 *
 * Changing the prompt requires bumping KEY_VERSION in key.ts — otherwise every character already
 * generated keeps serving text written under the old rules, forever.
 */

/** Pinned deliberately: the exact snapshot is recorded on every row via modelVersion. */
export const MODEL = 'claude-haiku-4-5-20251001';

/** A three-field JSON object needs nowhere near this, but leaves room for a long bio. */
const MAX_TOKENS = 1024;

/**
 * Per-attempt ceiling. With maxRetries: 1 the worst case is roughly double this, which has to stay
 * inside the function's own maxDuration alongside the Wikipedia fetch.
 */
const REQUEST_TIMEOUT_MS = 20_000;

const SYSTEM = `You write short, spoiler-free descriptions of television characters.

You will be given source text about a character, plus the show they appear in. The source is usually a plot summary, and most of it must not be used.

Only these four kinds of fact may appear in the bio:
1. Who they are to other characters — family, partner, colleague, rival.
2. What they do — their job, role, or position.
3. What they are like — temperament, values, reputation.
4. Where they sit in the show's world — the setting, and their place in it.

Everything else is off-limits. Never describe anything that HAPPENS: events, actions they take, things they witness, secrets, deaths, arrests, crimes, betrayals, twists, or how anyone changes across the series. If a fact would only be known to someone who has already watched the episodes, leave it out.

Write in the present tense, as if introducing this character to someone about to watch their first episode.

Prefer ONE sentence. Write a second only if the allowed facts genuinely fill it. A one-line bio is the correct answer for most characters, not a failure — minor characters often have nothing on record except who they are connected to, and that alone is a complete bio.

Worked example. Source text: "Finn DeTrolio is Meadow Soprano's boyfriend, a dental student working a summer job at a construction site. There he witnesses Vito Spatafore performing oral sex on a security guard. Vito later corners him and intimidates him into silence, and Finn becomes terrified of him."
Correct bio: "Meadow Soprano's boyfriend, a dental student working a summer construction job."
Everything after the first sentence of that source is an event, so none of it is used. The result is short because the source offers nothing else that is allowed.

Also:
- Write about the character, never the actor who plays them. Never mention the writers, creators, or how the show was made.
- Use only the source text. If it does not support a claim, leave the field null or choose the safest role tag.
- aliases: other names the character is commonly called — nicknames, a formal or full name, a title or rank. Only names in use from the start; a name revealed as a twist is a spoiler and must be left out. Do not repeat the name you were given. Empty array if there are none.
- occupation: their in-universe job as a short noun phrase ("mob boss", "high school chemistry teacher"). Use null if the source does not say.
- roleTag: "main" for a lead, "supporting" for a regular non-lead, "recurring" for someone who appears across multiple episodes without being a regular, "guest" for a one-off. If the source gives no signal, use "supporting".`;

const SCHEMA = {
  type: 'object',
  properties: {
    bio: {
      type: 'string',
      description: 'One to three sentences describing the character, in-universe.',
    },
    occupation: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
      description: "The character's in-universe occupation, or null if unstated.",
    },
    aliases: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Other names this character is commonly known by in-universe: nicknames, formal or full names, titles. Empty array if the source lists none.',
    },
    roleTag: {
      type: 'string',
      enum: ROLE_TAGS,
      description: 'How central the character is to the show.',
    },
  },
  required: ['bio', 'occupation', 'aliases', 'roleTag'],
  additionalProperties: false,
} as const;

/**
 * `permanent` decides whether the caller may negative-cache the result. A missing source is
 * permanent-ish (until someone writes the article); a rate limit or a socket hangup is not, and
 * caching it would freeze a five-minute outage into a lasting "no".
 */
export type GenerateResult =
  | { ok: true; data: Enrichment }
  | { ok: false; reason: string; permanent: boolean };

let client: Anthropic | null = null;

/**
 * Constructed lazily so a missing key surfaces as a clear 503 from the handler rather than an
 * exception thrown while the module is still being imported.
 *
 * maxRetries: 1 is the brief's "one retry on transient failure" — the SDK already retries 408/409/
 * 429/5xx and connection errors with backoff, so there's no hand-rolled retry loop to write.
 */
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) {
    client = new Anthropic({ timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  }
  return client;
}

function isRoleTag(v: unknown): v is RoleTag {
  return typeof v === 'string' && (ROLE_TAGS as readonly string[]).includes(v);
}

/**
 * Validate even though the schema is API-enforced. This is the boundary between someone else's
 * output and our stored data — a cheap check here beats a malformed row served to every user of
 * that character from now on.
 */
function toEnrichment(raw: unknown, source: SourceText, characterName: string): Enrichment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const bio = typeof r.bio === 'string' ? r.bio.trim() : '';
  if (!bio) return null;

  const occupationRaw = typeof r.occupation === 'string' ? r.occupation.trim() : '';

  /**
   * The model is told not to repeat the given name, but it does anyway often enough to matter —
   * "AKA Tony Soprano" under the heading "Tony Soprano" looks broken. Dedupe case-insensitively
   * against the name and against each other, and cap both count and length so a bad response
   * can't push a wall of text into the header.
   */
  const seen = new Set([characterName.trim().toLowerCase()]);
  const aliases = (Array.isArray(r.aliases) ? r.aliases : [])
    .filter((a): a is string => typeof a === 'string')
    .map((a) => a.trim().slice(0, 60))
    .filter((a) => {
      const k = a.toLowerCase();
      if (!a || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 6);

  return {
    bio,
    occupation: occupationRaw || null,
    aliases,
    roleTag: isRoleTag(r.roleTag) ? r.roleTag : 'supporting',
    sourceUrl: source.url,
    modelVersion: MODEL,
    generatedAt: new Date().toISOString(),
  };
}

export async function generateEnrichment(input: {
  showTitle: string;
  characterName: string;
  source: SourceText;
}): Promise<GenerateResult> {
  const anthropic = getClient();
  if (!anthropic) {
    console.error('ANTHROPIC_API_KEY is not set; enrichment cannot be generated');
    return { ok: false, reason: 'not_configured', permanent: false };
  }

  const userContent = [
    `Show: ${input.showTitle}`,
    `Character: ${input.characterName}`,
    '',
    'Source text:',
    input.source.text,
  ].join('\n');

  let message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      // 4xx other than 429 means the request itself is wrong — retrying won't fix it, but it's our
      // bug rather than a fact about the character, so it still isn't cached as "unavailable".
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

  const enrichment = toEnrichment(parsed, input.source, input.characterName);
  if (!enrichment) {
    return { ok: false, reason: 'failed_validation', permanent: false };
  }

  return { ok: true, data: enrichment };
}
