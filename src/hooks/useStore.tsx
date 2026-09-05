import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { AppData, AppSettings, Show, ShareStore, CastMember } from '../types';
import * as storage from '../lib/storage';
import { stampEdits } from '../lib/sync';
import { genId, initials, colorForIndex } from '../lib/utils';
import { packShow, packCast, type SharePacket } from '../lib/shareLink';
import { isDisposable, countDisposable, countKept } from '../lib/castValue';

interface ShareSheetState {
  /**
   * What the link will contain. Built here and encoded in the sheet, because encoding is async —
   * it compresses — and a store getter that returns a promise would spread through every caller.
   */
  packet: SharePacket;
  title: string;
  subtitle: string;
  photo: string | null;
  initials: string;
  color: string;
}

export interface Backup {
  app: 'cast-tracker';
  version: 1;
  exportedAt: number;
  data: AppData;
  settings: AppSettings;
  shares: ShareStore;
  recent: string[];
}

interface StoreValue {
  data: AppData;
  settings: AppSettings;
  recentShows: string[];
  /**
   * `stamp: false` applies a change without marking it as this device's work. Only sync uses it —
   * see the note on the implementation.
   */
  updateData: (fn: (d: AppData) => void, opts?: { stamp?: boolean }) => void;
  /** The last save to localStorage failed — almost always a full quota. Changes are on screen only. */
  storageFailed: boolean;
  setTheme: (t: 'Light' | 'Dark') => void;
  setShowColumns: (n: number) => void;
  setCastColumns: (n: number) => void;
  setMapZoom: (n: number) => void;
  exportBackup: () => Backup;
  /** How many of a show's records were auto-loaded and still hold nothing of the user's. */
  disposableCount: (showId: string) => number;
  /** Records across the whole library that a backup would carry — the ones that can't reload. */
  keptTotal: number;
  /** Drops those records. Anything edited is kept, and anything dropped comes back on re-open. */
  clearDisposable: (showId: string) => number;
  backupState: storage.BackupState;
  dismissBackupNudge: () => void;
  importBackup: (raw: string) => { ok: true } | { ok: false; error: string };
  resetAll: () => void;
  /** Empties the library as an edit, so other devices lose it too. See the note on the implementation. */
  clearEverywhere: () => void;
  pushRecent: (id: string) => void;
  showById: (id: string | null) => Show | undefined;
  shareShow: (id: string) => ShareSheetState;
  shareCast: (showId: string, castId: string) => ShareSheetState;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => storage.loadData());
  const [settings, setSettings] = useState<AppSettings>(() => storage.loadSettings());
  const [recentShows, setRecentShows] = useState<string[]>(() => storage.loadRecent());

  const [storageFailed, setStorageFailed] = useState(false);

  const updateData = useCallback((fn: (d: AppData) => void, opts?: { stamp?: boolean }) => {
    setData((prev) => {
      const next: AppData = structuredClone(prev);
      fn(next);
      /**
       * The one place edits get timestamped, and the one place deletions become tombstones.
       *
       * Done by diffing prev against next rather than asking each edit site to stamp itself. Every
       * call site that forgot would produce an edit that saves locally and never syncs — invisible
       * until someone picks up their other phone and finds the work missing. Measured at 0.6ms for
       * the clone above on a 336-record library, so a second pass over the same data is not the
       * expensive part of this function.
       */
      /**
       * Skipped when the change came from the server.
       *
       * Records arriving from a pull already carry the `editedAt` of whoever wrote them. Stamping
       * them here would overwrite that with "now", making every pulled record look like a fresh
       * local edit: it would bounce straight back on the next push, and — worse — it would win the
       * next conflict against the device that actually made the edit. Applying is not editing.
       */
      if (opts?.stamp !== false) stampEdits(prev, next);
      /**
       * A failed write used to be indistinguishable from a successful one: the edit stayed in
       * React state, the user saw it, and it was gone on reload. Recording the outcome lets the
       * app say so. Cleared again on the next write that lands, so freeing space fixes it without
       * a restart.
       */
      setStorageFailed(!storage.persistData(next));
      return next;
    });
  }, []);

  const persistSettingsPatch = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storage.persistSettings(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((t: 'Light' | 'Dark') => persistSettingsPatch({ theme: t }), [persistSettingsPatch]);
  const setShowColumns = useCallback((n: number) => persistSettingsPatch({ showColumns: n }), [persistSettingsPatch]);
  const setCastColumns = useCallback((n: number) => persistSettingsPatch({ castColumns: n }), [persistSettingsPatch]);
  const setMapZoom = useCallback((n: number) => persistSettingsPatch({ mapZoom: n }), [persistSettingsPatch]);

  const [backupState, setBackupState] = useState<storage.BackupState>(() => storage.loadBackupState());
  const patchBackupState = useCallback((patch: Partial<storage.BackupState>) => {
    setBackupState((prev) => { const next = { ...prev, ...patch }; storage.persistBackupState(next); return next; });
  }, []);
  /**
   * Both waving the nudge away and acting on it record how much was worth saving at the time, so
   * the nudge can come back once there's meaningfully more. Dismissing used to silence it forever,
   * which is fine for someone with eight characters and wrong for the same person six weeks later
   * with a hundred they've annotated.
   */
  const dismissBackupNudge = useCallback(
    () => patchBackupState({ dismissedAt: Date.now(), ackedAtCount: keptTotalRef.current }),
    [patchBackupState],
  );

  const exportBackup = useCallback((): Backup => {
    // Exporting is what clears the nudge — the user has a copy off-device now.
    patchBackupState({ lastExportAt: Date.now(), ackedAtCount: keptTotalRef.current });
    /**
     * Auto-loaded records are left out. They're TMDb's, not yours, they can outnumber your own
     * by a hundred to one after a season of browsing, and every one of them comes back the moment
     * the episode is opened again. A backup should be the part that can't be re-fetched.
     */
    const slim: AppData = { shows: data.shows.map((s) => ({ ...s, cast: s.cast.filter((c) => !isDisposable(c)) })) };
    /**
     * `shares` is always empty now and stays in the format for compatibility. The share codes it
     * used to carry only ever resolved on the device that created them, so a backup full of them
     * restored nothing anywhere — there is no data here to preserve, only a field shape.
     */
    return { app: 'cast-tracker', version: 1, exportedAt: Date.now(), data: slim, settings, shares: {} as ShareStore, recent: recentShows };
  }, [data, settings, recentShows, patchBackupState]);

  // Read inside callbacks that must not re-create themselves every time the count moves.
  const keptTotalRef = useRef(0);
  const keptTotal = useMemo(
    () => data.shows.reduce((n, s) => n + countKept(s.cast), 0),
    [data.shows],
  );
  keptTotalRef.current = keptTotal;

  const disposableCount = useCallback(
    (showId: string) => countDisposable(data.shows.find((s) => s.id === showId)?.cast || []),
    [data],
  );

  const clearDisposable = useCallback((showId: string) => {
    let removed = 0;
    updateData((d) => {
      const sh = d.shows.find((x) => x.id === showId);
      if (!sh) return;
      const before = sh.cast.length;
      sh.cast = sh.cast.filter((c) => !isDisposable(c));
      removed = before - sh.cast.length;
    });
    return removed;
  }, [updateData]);

  const importBackup = useCallback((raw: string): { ok: true } | { ok: false; error: string } => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false as const, error: 'That file isn’t valid JSON.' };
    }
    const b = parsed as Partial<Backup>;
    if (!b || b.app !== 'cast-tracker' || !b.data || !Array.isArray(b.data.shows)) {
      return { ok: false as const, error: 'This doesn’t look like a Cast Tracker backup file.' };
    }
    const nextData: AppData = { shows: b.data.shows };
    storage.persistData(nextData);
    setData(nextData);
    if (Array.isArray(b.recent)) { storage.persistRecent(b.recent); setRecentShows(b.recent); }
    if (b.settings && typeof b.settings === 'object') { persistSettingsPatch(b.settings); }
    return { ok: true as const };
  }, [persistSettingsPatch]);

  const resetAll = useCallback(() => {
    storage.clearAllData();
    setData({ shows: [] });
    setRecentShows([]);
  }, []);

  /**
   * Empties the library as an *edit*, so the deletion travels.
   *
   * `resetAll` writes nothing through `updateData`, which is why it has always been local-only:
   * no tombstones, nothing to push, and the next pull hands the whole library straight back. That
   * is the right behaviour for "clear this device" and the wrong one for "delete my data", and the
   * app previously offered only one control for both.
   *
   * Two passes, because tombstones are produced by diffing: emptying the cast lists first records
   * every authored record as deleted, and removing the shows then records those. One pass would
   * tombstone the shows only, leaving the cast rows orphaned on the server — invisible, but still
   * that user's data sitting in a table after they asked for it to be gone.
   *
   * The caller syncs afterwards. Offline, the tombstones wait in their own key, which `clearAllData`
   * deliberately does not touch, and go out on the next sync.
   */
  const clearEverywhere = useCallback(() => {
    updateData((d) => { for (const s of d.shows) s.cast = []; });
    updateData((d) => { d.shows = []; });
  }, [updateData]);

  const pushRecent = useCallback((id: string) => {
    setRecentShows((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 6);
      storage.persistRecent(next);
      return next;
    });
  }, []);

  const showById = useCallback((id: string | null) => (id ? data.shows.find((s) => s.id === id) : undefined), [data]);

  const shareShow = useCallback((id: string): ShareSheetState => {
    const sh = data.shows.find((x) => x.id === id)!;
    const packet = packShow(sh);
    const n = packet.c.length;
    return {
      packet,
      title: sh.title,
      // Counts what will actually travel, not what is on screen. Auto-loaded cast stays behind and
      // reappears from TMDb on the other side, so promising 61 characters and sending 6 would be
      // the same kind of lie the codes were.
      subtitle: n === 0 ? 'Just the show — no characters added yet' : `${n} ${n === 1 ? 'character' : 'characters'} you've written`,
      photo: sh.poster,
      initials: initials(sh.title),
      color: sh.color,
    };
  }, [data]);

  const shareCast = useCallback((showId: string, castId: string): ShareSheetState => {
    const sh = data.shows.find((x) => x.id === showId)!;
    const c = sh.cast.find((x) => x.id === castId)!;
    return { packet: packCast(sh, c), title: c.name, subtitle: `From ${sh.title}`, photo: c.photo, initials: initials(c.name), color: c.color };
  }, [data]);

  const value = useMemo<StoreValue>(() => ({
    data, settings, recentShows, updateData, setTheme, setShowColumns, setCastColumns, setMapZoom,
    exportBackup, importBackup, resetAll, clearEverywhere, pushRecent, showById, shareShow, shareCast,
    backupState, dismissBackupNudge, disposableCount, clearDisposable, keptTotal, storageFailed,
  }), [keptTotal, storageFailed, data, settings, recentShows, updateData, setTheme, setShowColumns, setCastColumns, setMapZoom, exportBackup, importBackup, resetAll, clearEverywhere, pushRecent, showById, shareShow, shareCast, backupState, dismissBackupNudge, disposableCount, clearDisposable]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
