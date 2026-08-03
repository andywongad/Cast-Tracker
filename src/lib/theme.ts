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
  accentSoft: string;
  initialsTint: string;
  scrim: string;
}

export const THEMES: Record<ThemeName, ThemeTokens> = {
  Dark: {
    bg: '#0D0F14', card: '#14171F', sheet: '#12141C', surface: '#171A22', border: '#1D2029',
    inputBorder: '#242836', divider: '#2A2E3B', text: '#F5F5F7', textMuted: '#6B7080',
    textSecondary: '#9599A8', textTertiary: '#C7CAD6', textFaint: '#4B4F5C', iconMuted: '#3A3F4E',
    accentSoft: '#8B8FF0', initialsTint: 'rgba(99,102,241,0.75)', scrim: 'rgba(0,0,0,0.6)',
  },
  Light: {
    bg: '#F5F5F7', card: '#FFFFFF', sheet: '#FFFFFF', surface: '#EEEEF2', border: '#E3E3E9',
    inputBorder: '#D7D7E0', divider: '#E3E3E9', text: '#15161C', textMuted: '#8A8D98',
    textSecondary: '#6B6E79', textTertiary: '#42454F', textFaint: '#A6A9B2', iconMuted: '#C7CAD1',
    accentSoft: '#4C4FCE', initialsTint: 'rgba(99,102,241,0.85)', scrim: 'rgba(15,16,20,0.45)',
  },
};

export const ACCENT = '#6366F1';
export const DANGER = '#C24B4B';
export const DANGER_TEXT = '#E08A80';
export const LABEL_ACCENT = '#C9924A';
export const MAP_LINE = '#E85D9C';
export const MAP_HEART = '#D2453B';

export function applyTheme(el: HTMLElement, name: ThemeName) {
  const t = THEMES[name];
  el.style.setProperty('--bg', t.bg);
  el.style.setProperty('--card', t.card);
  el.style.setProperty('--sheet', t.sheet);
  el.style.setProperty('--surface', t.surface);
  el.style.setProperty('--border', t.border);
  el.style.setProperty('--input-border', t.inputBorder);
  el.style.setProperty('--divider', t.divider);
  el.style.setProperty('--text', t.text);
  el.style.setProperty('--text-muted', t.textMuted);
  el.style.setProperty('--text-secondary', t.textSecondary);
  el.style.setProperty('--text-tertiary', t.textTertiary);
  el.style.setProperty('--text-faint', t.textFaint);
  el.style.setProperty('--icon-muted', t.iconMuted);
  el.style.setProperty('--accent-soft', t.accentSoft);
  el.style.setProperty('--initials-tint', t.initialsTint);
  el.style.setProperty('--scrim', t.scrim);
  el.style.background = t.bg;
  el.style.color = t.text;
}
