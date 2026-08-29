/**
 * Repairs for escape sequences that survive JSON.parse.
 *
 * Structured output guarantees the response parses. It does not guarantee that what comes out the
 * other side is clean prose: the Opus-family models vary in how they escape strings, and a
 * double-escaped response parses successfully into text that still carries its escaping. Observed
 * on the first real run of this feature, in one paragraph:
 *
 *   "Tony is secretly seeing Dr. Melfi \\u2014 and had her investigated"
 *   "the pressures at home and at work \\ Carmela, Meadow and Anthony Jr."
 *
 * Both would have rendered literally in the sheet. This is not a parsing bug to fix upstream — the
 * JSON was valid — so it is cleaned here, at the same boundary where every other field is
 * validated before it becomes data served to everyone.
 *
 * Lives in src/lib/ rather than beside the model call so it can be tested without pulling the
 * Anthropic SDK into a test bundle.
 */

/**
 * Decode leftover \\uXXXX sequences, then drop any backslash still standing.
 *
 * The second step is safe because this text is finished prose about television. A backslash is
 * never something a recap legitimately contains, so anything left after the first pass is damage.
 */
export function repairModelEscapes(text: string): string {
  return text
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/\\/g, '')
    // Escaping artifacts leave doubled spaces where a character was removed.
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
