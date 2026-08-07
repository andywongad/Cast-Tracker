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
  accentTint: string;
  accentSoft: string;
  initialsTint: string;
  scrim: string;
  /** Cards separate by soft diffused shadow, not strokes — these carry that weight. */
  shadowCard: string;
  shadowLift: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  Dark: {
    bg: '#0D0F14', card: '#14171F', sheet: '#12141C', surface: '#171A22', border: '#1D2029',
    inputBorder: '#242836', divider: '#2A2E3B', text: '#F5F5F7', textMuted: '#8A8A8A',
    textSecondary: '#9599A8', textTertiary: '#C7CAD6', textFaint: '#4B4F5C', iconMuted: '#3A3F4E',
    accent: '#5FB3A1', accentText: '#0D0F14', accentTint: 'rgba(95,179,161,0.16)', accentSoft: '#5FB3A1', initialsTint: 'rgba(255,255,255,0.55)', scrim: 'rgba(0,0,0,0.6)',
    shadowCard: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px rgba(0,0,0,0.35)',
    shadowLift: '0 2px 6px rgba(0,0,0,0.45), 0 16px 40px rgba(0,0,0,0.5)',
  },
  Light: {
    bg: '#F4F4F3', card: '#FFFFFF', sheet: '#FAFAFA', surface: '#F4F4F3', border: '#ECECEA',
    inputBorder: '#ECECEA', divider: '#ECECEA', text: '#1A1A1A', textMuted: '#8A8A8A',
    textSecondary: '#6E6E6E', textTertiary: '#3D3D3D', textFaint: '#B0B0B0', iconMuted: '#C9C9C7',
    accent: '#186A5E', accentText: '#FFFFFF', accentTint: '#E8F0EE', accentSoft: '#186A5E', initialsTint: 'rgba(26,26,26,0.35)', scrim: 'rgba(26,26,26,0.35)',
    shadowCard: '0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.05)',
    shadowLift: '0 2px 8px rgba(0,0,0,0.05), 0 18px 44px rgba(0,0,0,0.09)',
  },
};

/** Status glow beneath the bottom nav. The CTA itself uses --text (charcoal). */
export const CTA_GLOW_GREEN = '#3FB27F';
export const DANGER = '#C24B4B';
export const DANGER_TEXT = '#E08A80';
export const MAP_LINE = '#E85D9C';
export const MAP_HEART = '#D2453B';

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
