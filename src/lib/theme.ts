export type ThemeName = 'Light' | 'Dark';

export interface ThemeTokens {
  bg: string;
  /**
   * The page behind the app, seen only when the window is wider than the app is.
   *
   * On a phone this is never visible — the app is the whole viewport. On a laptop it is most of
   * the screen, and it used to be a hardcoded near-white in both themes, which put a bright void
   * around a near-black column in dark mode and read as a page that had failed to load rather than
   * an app that is happy at one width.
   *
   * A step deeper than `bg` rather than equal to it, so the app reads as a surface resting on a
   * page instead of a rectangle that merely stops.
   */
  backdrop: string;
  card: string;
  sheet: string;
  surface: string;
  /**
   * Search fields, which sit on a page background rather than inside a sheet.
   *
   * They used `surface`, and so do the unselected season chips directly above them — the same
   * fill, so the field read as one more chip in the row instead of the thing you type into. This
   * lifts: white against the mist, and a step up out of the water in the dark, where white would
   * be a hole in the page rather than a field. Form inputs inside a sheet keep `surface`, because
   * there the sheet is already near-white and a well is the right read.
   */
  fieldBg: string;
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
  /**
   * Destructive actions. A token rather than the single hardcoded `#C24B4B` that six components
   * carried: one red cannot serve both themes, and that one measured 3.44:1 on the dark sheet —
   * below AA, on the text warning you that something is irreversible.
   */
  danger: string;
  /**
   * Ink for text sitting *on* a danger fill, as `ctaText` is to `cta`.
   *
   * `danger` is tuned to be read against a sheet, which makes it light on dark — and white text on
   * that salmon measures 2.39:1. A filled red bar therefore can't take white on both themes and
   * needs its own ink, the same way the gate does.
   */
  dangerText: string;
  accentTint: string;
  accentSoft: string;
  initialsTint: string;
  scrim: string;
  /** Keyboard focus ring. Must clear 3:1 against every surface it can land on (WCAG 1.4.11). */
  focusRing: string;
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
    bg: '#0B1926', backdrop: '#060F18', card: '#122433', sheet: '#0F2130', surface: '#162C3D', fieldBg: '#26485F', border: '#1D3346',
    inputBorder: '#274156', divider: '#24394C', text: '#E9EFF6', textMuted: '#9AAFC4',
    textSecondary: '#9CB0C5', textTertiary: '#C6D3E0', textFaint: '#8FA3B9', iconMuted: '#627687',
    accent: '#8FA9C4', accentText: '#0B1926', accentTint: 'rgba(143,169,196,0.16)', accentSoft: '#9FB8D0',
    cta: '#E2664F', ctaText: '#0B1926', danger: '#E2938A', dangerText: '#0B1926', focusRing: '#E2664F', initialsTint: 'rgba(233,239,246,0.5)', scrim: 'rgba(4,12,20,0.65)',
    shadowCard: '0 1px 2px rgba(0,0,0,0.45), 0 8px 24px rgba(3,10,18,0.4)',
    shadowLift: '0 2px 6px rgba(0,0,0,0.5), 0 16px 40px rgba(3,10,18,0.55)',
  },
  Light: {
    bg: '#E8EDF3', backdrop: '#D6E0EB', card: '#FFFFFF', sheet: '#F7FAFC', surface: '#DFE7F0', fieldBg: '#FFFFFF', border: '#D2DCE8',
    inputBorder: '#C9D5E3', divider: '#D2DCE8', text: '#15293B', textMuted: '#4F6480',
    textSecondary: '#4C617A', textTertiary: '#2B3F55', textFaint: '#556B84', iconMuted: '#7C848D',
    accent: '#3C5067', accentText: '#FFFFFF', accentTint: '#E2E9F1', accentSoft: '#3C5067',
    cta: '#C1462E', ctaText: '#FFFFFF', danger: '#B23B2C', dangerText: '#FFFFFF', focusRing: '#C1462E', initialsTint: 'rgba(21,41,59,0.32)', scrim: 'rgba(16,32,48,0.42)',
    shadowCard: '0 1px 2px rgba(21,41,59,0.04), 0 8px 24px rgba(21,41,59,0.07)',
    shadowLift: '0 2px 8px rgba(21,41,59,0.07), 0 18px 44px rgba(21,41,59,0.12)',
  },
};

/** Status glow beneath the bottom nav — tinted to match the accent so it reads as one light source. */
export const CTA_GLOW = '#C1462E';
/* The `DANGER` / `DANGER_TEXT` constants that lived here are gone: one fixed pair of reds cannot
   serve two themes, which is what the `danger` and `dangerText` tokens above are for. */
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
