import Anthropic from '@anthropic-ai/sdk';
import { ROLE_TAGS, type Enrichment, type RoleTag } from '../../src/lib/enrichment/types';
import type { SourceText } from './source-wikipedia';

/**
 * The Claude call that turns source text into a structured bio.
 *
 * The schema is enforced by the API via output_config.format rather than requested in the prompt.
 * "Return only JSON, no markdown fences" is a request a model can decline; a json_schema is a
 * constraint it cannot violate, which removes the entire class of unparseable-response failures.
 *
 * The model is asked for three fields only. sourceUrl, modelVersion and generatedAt are filled in
 * here from facts we already hold — a model asked to cite its own source will happily invent a
 * convincing URL it never read.
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

const SYSTEM = `You write short, factual, in-universe descriptions of television characters.

You will be given source text about a character, plus the show they appear in. Summarize only what the source supports.

Rules:
- Write about the character, never the actor who plays them.
- Use only the source text. If it does not support a claim, leave the field null or choose the safest role tag.
- bio: 1-3 sentences, present tense, no spoilers beyond what the source states plainly.
- occupation: the character's in-universe job as a short noun phrase ("mob boss", "high school chemistry teacher"). Use null if the source does not say.
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
    roleTag: {
      type: 'string',
      enum: ROLE_TAGS,
      description: 'How central the character is to the show.',
    },
  },
  required: ['bio', 'occupation', 'roleTag'],
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
function toEnrichment(raw: unknown, source: SourceText): Enrichment | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const bio = typeof r.bio === 'string' ? r.bio.trim() : '';
  if (!bio) return null;

  const occupationRaw = typeof r.occupation === 'string' ? r.occupation.trim() : '';

  return {
    bio,
    occupation: occupationRaw || null,
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

  const enrichment = toEnrichment(parsed, input.source);
  if (!enrichment) {
    return { ok: false, reason: 'failed_validation', permanent: false };
  }

  return { ok: true, data: enrichment };
}
