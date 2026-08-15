import type { ShowType } from '../types';

/**
 * `type` is a behaviour switch, not a genre. It decides whether people are called characters or
 * contestants, whether the relationship map is offered, whether a season carries its cast forward
 * or replaces it, and whether TVmaze in-character photos are looked up.
 *
 * So the label is "Scripted", not "Drama" — a comedy, a sci-fi series and a period drama all want
 * identical behaviour, and a genre-sounding label made people reach for a category that doesn't
 * exist. The stored values are unchanged; this is what the user reads.
 */
export const SHOW_TYPE_LABELS: Record<ShowType, string> = {
  DRAMA: 'Scripted',
  REALITY: 'Reality',
  VARIETY: 'Variety',
};

/** Two-letter form for the badge on a dense show tile. */
export const SHOW_TYPE_SHORT: Record<ShowType, string> = {
  DRAMA: 'SC',
  REALITY: 'RE',
  VARIETY: 'VA',
};

export const PALETTE = ['#5B4FD6', '#3F5FA8', '#8B4FA0', '#4F8B7A', '#A0574F', '#4F6BA0', '#7A4FA0'];

export function colorForIndex(i: number): string {
  return PALETTE[i % PALETTE.length];
}

export function initials(name: string | null | undefined): string {
  const p = (name || '?').trim().split(/[\s-]+/).filter(Boolean);
  return (((p[0] || '?')[0] || '?') + (p[1] ? p[1][0] : '')).toUpperCase();
}

export function genId(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function genShareCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export function epNumFromLabel(label: string | undefined | null): number {
  const m = /(\d+)/.exec(label || '');
  return m ? parseInt(m[1], 10) : 1;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * `size` accepts any background-size value, not just cover/contain — cast cards use '100% auto'
 * to scale a portrait still to the card's full width and let the bottom overflow.
 * `position` defaults to centre; pass 'top' to anchor the crop so faces are never cut off.
 */
import type { PhotoCrop } from '../types';

/**
 * Background style for a photo plus its stored framing. With no crop, falls back to the default
 * full-width centred framing used everywhere else.
 */
export function cropStyle(url: string | null | undefined, crop: PhotoCrop | null | undefined) {
  if (!url) return {};
  if (!crop) return bgStyle(url, '100% auto', 'center');
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${crop.size}% auto`,
    backgroundPosition: `${crop.x}% ${crop.y}%`,
    backgroundRepeat: 'no-repeat' as const,
  };
}

export function bgStyle(url: string | null | undefined, size: string = 'cover', position: string = 'center') {
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: size, backgroundPosition: position, backgroundRepeat: 'no-repeat' as const } : {};
}
