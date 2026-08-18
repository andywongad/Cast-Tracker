export type ThemeName = 'Light' | 'Dark';

export interface ThemeTokens {
  bg: string;
  card: string;
  sheet: string;
  surface: string;
  border: string;
  inputBorder: string;
  divider: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  textTertiary: string;
  textFaint: string;
  iconMuted: string;
  accent: string;
  accentText: string;
  /**
   * The one warm action per screen, held apart from `accent` on purpose.
   *
   * In the photograph the red is about two percent of the frame — it works because it is the only
   * saturated thing in it. Spending the same red on every selected chip, link and toggle inverts
   * that ratio and the scarcity, which was the whole effect, is gone; worse, on a screen made of
   * faces a warm accent sits in the same register as skin and stops reading as interface at all.
   * So the interface takes the water and the gate is reserved for the primary action.
   */
  cta: string;
  ctaText: string;
  accentTint: string;
  accentSoft: string;
  initialsTint: string;
  scrim: string;
  /** Cards separate by soft diffused shadow, not strokes — these carry that weight. */
  shadowCard: string;
  shadowLift: string;
}

/**
 * Drawn from a photograph of a torii standing in misted water: everything is a cool blue-grey
 * except one warm vermilion, which is the only saturated thing in the frame — and the palette
 * keeps that proportion, not just the hues. The interface is water; the gate is one action.
 *
 * Light is the mist — the pale sky at the top of that picture, sampled at #DDE6EF, with text in
 * the deep water rather than black. Dark is the water at the bottom, #10293F, taken a little
 * deeper so cards can sit above it. The accent is the gate itself, #AD342E where the fog softens
 * it and near #DB5C4E where it doesn't; the value below sits between the two so it reads as that
 * red without going brown on a light background, and lifts on dark where it needs to carry
 * against a near-black.
 *
 * The neutrals are deliberately not grey. Every one of them keeps a blue cast, which is what
 * makes a single warm accent look intentional instead of stray.
 */
export const THEMES: Record<ThemeName, ThemeTokens> = {
  Dark: {
    bg: '#0B1926', card: '#122433', sheet: '#0F2130', surface: '#162C3D', border: '#1D3346',
    inputBorder: '#274156', divider: '#24394C', text: '#E9EFF6', textMuted: '#8296AC',
    textSecondary: '#9CB0C5', textTertiary: '#C6D3E0', textFaint: '#566A80', iconMuted: '#3E566C',
    accent: '#8FA9C4', accentText: '#0B1926', accentTint: 'rgba(143,169,196,0.16)', accentSoft: '#9FB8D0',
    cta: '#E2664F', ctaText: '#0B1926', initialsTint: 'rgba(233,239,246,0.5)', scrim: 'rgba(4,12,20,0.65)',
    shadowCard: '0 1px 2px rgba(0,0,0,0.45), 0 8px 24px rgba(3,10,18,0.4)',
    shadowLift: '0 2px 6px rgba(0,0,0,0.5), 0 16px 40px rgba(3,10,18,0.55)',
  },
  Light: {
    bg: '#E8EDF3', card: '#FFFFFF', sheet: '#F7FAFC', surface: '#DFE7F0', border: '#D2DCE8',
    inputBorder: '#C9D5E3', divider: '#D2DCE8', text: '#15293B', textMuted: '#7A8CA3',
    textSecondary: '#4C617A', textTertiary: '#2B3F55', textFaint: '#A3B1C2', iconMuted: '#BCC8D6',
    accent: '#3C5067', accentText: '#FFFFFF', accentTint: '#E2E9F1', accentSoft: '#3C5067',
    cta: '#C1462E', ctaText: '#FFFFFF', initialsTint: 'rgba(21,41,59,0.32)', scrim: 'rgba(16,32,48,0.42)',
    shadowCard: '0 1px 2px rgba(21,41,59,0.04), 0 8px 24px rgba(21,41,59,0.07)',
    shadowLift: '0 2px 8px rgba(21,41,59,0.07), 0 18px 44px rgba(21,41,59,0.12)',
  },
};

/** Status glow beneath the bottom nav — tinted to match the accent so it reads as one light source. */
export const CTA_GLOW = '#C1462E';
/**
 * Destructive actions sit deeper and cooler than the accent on purpose. With a red accent the two
 * would otherwise be the same colour, and "delete" would look like the primary action on the
 * screen. This is still recognisably red, just further from the torii.
 */
/** Free to be a plain red again now that red isn't ambient — nothing else on screen competes. */
export const DANGER = '#B23B2C';
export const DANGER_TEXT = '#E2938A';
/** Relationship lines take a mid-water slate; hearts take the gate. */
export const MAP_LINE = '#6E8AA8';
export const MAP_HEART = '#C1462E';

/**
 * Token map -> CSS custom properties, derived from the key names
 * (`inputBorder` -> `--input-border`). Deriving them means a new token in ThemeTokens
 * reaches the DOM automatically — the old hand-written list silently dropped anything
 * you forgot to add to it.
 */
export function themeVars(t: ThemeTokens): Record<string, string> {
  return Object.fromEntries(
    Object.entries(t).map(([k, v]) => [`--${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`, v]),
  );
}
