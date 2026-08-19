import type { AppData, AppSettings, CastMember, ShareStore, Show } from '../types';

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

/** Where unreadable data is parked rather than thrown away. See loadData. */
const QUARANTINE_KEY = 'ct.v2.unreadable';

/**
 * Arrays the UI walks without checking first, so a record missing one is a crash rather than a
 * gap. `versions` is the live example: CastCard reads `c.versions.length` unguarded.
 */
function coerceCast(raw: unknown): CastMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is CastMember => !!c && typeof c === 'object' && typeof (c as CastMember).id === 'string')
    .map((c) => ({
      ...c,
      // A record with no name white-screens the character sheet, which calls c.name.trim()
      // unguarded when building the AKA list. Pass 1 coerced the arrays and missed this.
      name: typeof c.name === 'string' ? c.name : '',
      otherNames: Array.isArray(c.otherNames) ? c.otherNames.filter((n): n is string => typeof n === 'string') : [],
      versions: Array.isArray(c.versions) ? c.versions : [],
      relationships: Array.isArray(c.relationships) ? c.relationships : [],
    }));
}

function coerceShow(raw: unknown): Show | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Show;
  if (typeof s.id !== 'string' || !s.id) return null;
  return {
    ...s,
    title: typeof s.title === 'string' ? s.title : '',
    /**
     * Anything that isn't the string 'completed' is watching, including absent.
     *
     * The grouping already behaved this way by accident — it asks `status !== 'completed'` — but
     * nothing wrote a value for shows created before the field existed, so they carried
     * `undefined` and were sorted correctly only because of how that comparison happens to fall.
     * Now that a control writes this field, the default is stated here instead of being a
     * property of one expression somebody could reasonably rewrite.
     *
     * Additive: it fills a gap in what is loaded, and never rewrites a value that is already there.
     */
    status: s.status === 'completed' ? 'completed' : 'watching',
    cast: coerceCast(s.cast),
  };
}

/**
 * Read the library, surviving anything that isn't the shape we expect.
 *
 * The previous version cast the parsed JSON straight to AppData. That only ever caught a *parse*
 * failure — `JSON.parse("null")` succeeds and returns null, so `loadData()` returned null and the
 * first `data.shows.reduce(...)` threw on every visit, with no way out short of clearing site
 * data. An older schema, a half-written import, or one malformed record did the same.
 *
 * Two rules here. A show that can't be understood is dropped rather than taking the library down
 * with it. And when the top-level shape is unusable, the raw text is copied to a quarantine key
 * before we hand back an empty library — otherwise the first save would overwrite the only copy
 * of data that might still be recoverable by hand.
 */
export function loadData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  const parsed = safeParse<unknown>(raw, null);

  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as AppData).shows)) {
    if (raw) {
      try {
        localStorage.setItem(QUARANTINE_KEY, raw);
      } catch {
        // Nothing better to do: if there's no room to park it, there was no room to keep it.
      }
    }
    return { shows: [] };
  }

  return { shows: (parsed as AppData).shows.map(coerceShow).filter((s): s is Show => !!s) };
}

/**
 * Returns whether the write landed.
 *
 * It used to swallow the failure, which meant a full quota looked exactly like a successful save:
 * the edit stayed on screen, backed by nothing, and vanished on reload. The caller now knows, so
 * it can say so — see `storageFailed` in useStore.
 */
export function persistData(data: AppData): boolean {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSettings(): AppSettings {
  const s = safeParse<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {});
  return {
    theme: s.theme ?? null,
    showColumns: s.showColumns ?? 2,
    castColumns: Math.min(s.castColumns ?? 2, 4),
    autoSave: s.autoSave ?? false,
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
  localStorage.removeItem(QUARANTINE_KEY);
  localStorage.removeItem(SHARE_KEY);
  localStorage.removeItem(RECENT_KEY);
  localStorage.removeItem(BACKUP_KEY);
}

const BACKUP_KEY = 'ct.backup.v1';

/** Tracks whether the user has been told their data is device-only, and whether they acted on it. */
export interface BackupState {
  lastExportAt: number | null;
  dismissedAt: number | null;
  /** Records worth saving at the moment of the last export or dismissal — the mark to grow from. */
  ackedAtCount?: number;
}

export function loadBackupState(): BackupState {
  const s = safeParse<Partial<BackupState>>(localStorage.getItem(BACKUP_KEY), {});
  return {
    lastExportAt: s.lastExportAt ?? null,
    dismissedAt: s.dismissedAt ?? null,
    ackedAtCount: s.ackedAtCount,
  };
}

export function persistBackupState(s: BackupState) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
