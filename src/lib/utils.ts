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
export function bgStyle(url: string | null | undefined, size: string = 'cover', position: string = 'center') {
  return url ? { backgroundImage: `url("${url}")`, backgroundSize: size, backgroundPosition: position, backgroundRepeat: 'no-repeat' as const } : {};
}
