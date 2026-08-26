/**
 * How long before a new episode someone wants telling.
 *
 * The presets are the ones every calendar and reminder UI has settled on — at the time of the
 * event, half an hour, an hour — plus a day, which is the one that actually matters for
 * television: "tomorrow night" is a plan, "in thirty minutes" is a scramble. Custom exists because
 * the useful lead time for a weekly drama and for a live final are not the same number, and
 * guessing which four presets suit everyone is how you end up with a fifth.
 *
 * Minutes throughout, including for the day presets. One unit means the comparisons, the storage
 * and the wire format cannot disagree with each other; the unit a person chose is recovered for
 * display by `splitLead` rather than stored separately, which would be a second source of truth
 * for the same number.
 *
 * WHAT THE SERVER CAN CURRENTLY DO WITH THIS: nothing yet, and it is written down here because
 * the gap is not visible from the UI. `api/check-episodes.ts` runs once a day at 06:00 UTC and
 * reads TMDb's `last_episode_to_air.air_date` — a date with no time, for an episode that has
 * already gone out. So today the preference is recorded and delivery is unchanged: the morning
 * after. Honouring a lead time needs an air *timestamp* (TVmaze's `airstamp` carries one) and a
 * cron that runs often enough to land inside the window.
 */

/** Nothing stored means the show is not followed from this browser. */
const KEY = 'ct.notify.v1';

/** An hour: far enough ahead to change what you do with the evening, close enough to still be about tonight. */
export const DEFAULT_LEAD_MINUTES = 60;

/** Four weeks. Past this a reminder is a diary entry, and the episode may not even be scheduled. */
export const MAX_LEAD_MINUTES = 40_320;

export interface LeadPreset {
  minutes: number;
  label: string;
}

/**
 * Ordered nearest-first, which is the order these are read in and the order every comparable
 * picker uses. "At time of episode" leads because it is the zero case, not because it is the
 * most useful.
 */
export const LEAD_PRESETS: readonly LeadPreset[] = [
  { minutes: 0, label: 'At time of episode' },
  { minutes: 30, label: '30 minutes before' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 1440, label: '1 day before' },
];

export type LeadUnit = 'minutes' | 'hours' | 'days';

const PER_UNIT: Record<LeadUnit, number> = { minutes: 1, hours: 60, days: 1440 };

export function isPreset(minutes: number): boolean {
  return LEAD_PRESETS.some((p) => p.minutes === minutes);
}

/**
 * The largest whole unit the value divides into, so 120 reads as "2 hours" rather than
 * "120 minutes" and 90 stays as "90 minutes" rather than becoming a fraction nobody typed.
 */
export function splitLead(minutes: number): { value: number; unit: LeadUnit } {
  if (minutes > 0 && minutes % PER_UNIT.days === 0) return { value: minutes / PER_UNIT.days, unit: 'days' };
  if (minutes > 0 && minutes % PER_UNIT.hours === 0) return { value: minutes / PER_UNIT.hours, unit: 'hours' };
  return { value: minutes, unit: 'minutes' };
}

export function toMinutes(value: number, unit: LeadUnit): number {
  return Math.round(value * PER_UNIT[unit]);
}

/** Plain English, and the string the button under the bell shows once something is chosen. */
export function formatLead(minutes: number): string {
  if (minutes <= 0) return 'At time of episode';
  const { value, unit } = splitLead(minutes);
  const noun = value === 1 ? unit.slice(0, -1) : unit;
  return `${value} ${noun} before`;
}

/** Bounds a typed number without silently accepting a blank or a negative. */
export function clampLead(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_LEAD_MINUTES;
  return Math.min(MAX_LEAD_MINUTES, Math.max(0, Math.round(minutes)));
}

type Store = Record<string, number>;

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    // Unreadable storage is the same as no preference: the show simply isn't followed here.
    return {};
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* A full quota must not be the reason a notification can't be turned on. */
  }
}

/**
 * The lead time chosen for this show on this device, or null if none was.
 *
 * Deliberately not "is this show followed" — the server owns that, because a subscription can be
 * dropped by the browser without telling anyone. This is only the number to show when the card
 * opens.
 */
export function readLead(showTmdbId: number): number | null {
  const v = read()[String(showTmdbId)];
  return typeof v === 'number' ? clampLead(v) : null;
}

export function writeLead(showTmdbId: number, minutes: number) {
  const store = read();
  store[String(showTmdbId)] = clampLead(minutes);
  write(store);
}

export function clearLead(showTmdbId: number) {
  const store = read();
  delete store[String(showTmdbId)];
  write(store);
}
