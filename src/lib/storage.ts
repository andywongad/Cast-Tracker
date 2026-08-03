import type { AppData, AppSettings, ShareStore } from '../types';

const DATA_KEY = 'ct.v2';
const SETTINGS_KEY = 'ct.settings.v1';
const SHARE_KEY = 'ct.shares.v1';
const RECENT_KEY = 'ct.recent.v1';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadData(): AppData {
  return safeParse<AppData>(localStorage.getItem(DATA_KEY), { shows: [] });
}

export function persistData(data: AppData) {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch {
    // storage full / unavailable — silently ignore, matches prototype behavior
  }
}

export function loadSettings(): AppSettings {
  const s = safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {});
  return {
    theme: s.theme ?? null,
    showColumns: s.showColumns ?? 2,
    castColumns: Math.min(s.castColumns ?? 2, 3),
  };
}

export function persistSettings(s: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function loadShares(): ShareStore {
  return safeParse<ShareStore>(localStorage.getItem(SHARE_KEY), {});
}

export function persistShares(store: ShareStore) {
  try {
    localStorage.setItem(SHARE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function loadRecent(): string[] {
  return safeParse<string[]>(localStorage.getItem(RECENT_KEY), []);
}

export function persistRecent(arr: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export function clearAllData() {
  localStorage.removeItem(DATA_KEY);
  localStorage.removeItem(SHARE_KEY);
  localStorage.removeItem(RECENT_KEY);
}
