import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { AppData, AppSettings, Show, ShareStore, SharePayload, CastMember } from '../types';
import * as storage from '../lib/storage';
import { genId, genShareCode, initials, colorForIndex } from '../lib/utils';

interface ShareSheetState {
  code: string;
  title: string;
  subtitle: string;
  photo: string | null;
  initials: string;
  color: string;
}

interface StoreValue {
  data: AppData;
  settings: AppSettings;
  shareStore: ShareStore;
  recentShows: string[];
  updateData: (fn: (d: AppData) => void) => void;
  setTheme: (t: 'Light' | 'Dark') => void;
  setShowColumns: (n: number) => void;
  setCastColumns: (n: number) => void;
  setAutoSave: (enabled: boolean) => void;
  resetAll: () => void;
  pushRecent: (id: string) => void;
  showById: (id: string | null) => Show | undefined;
  shareShow: (id: string) => ShareSheetState;
  shareCast: (showId: string, castId: string) => ShareSheetState;
  claimRedeem: (code: string, mode: 'show' | 'cast', activeShowId: string | null) => { ok: true; newShowId?: string } | { ok: false; error: string };
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => storage.loadData());
  const [settings, setSettings] = useState<AppSettings>(() => storage.loadSettings());
  const [shareStore, setShareStore] = useState<ShareStore>(() => storage.loadShares());
  const [recentShows, setRecentShows] = useState<string[]>(() => storage.loadRecent());

  const updateData = useCallback((fn: (d: AppData) => void) => {
    setData((prev) => {
      const next: AppData = structuredClone(prev);
      fn(next);
      storage.persistData(next);
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
  const setAutoSave = useCallback((enabled: boolean) => persistSettingsPatch({ autoSave: enabled }), [persistSettingsPatch]);

  const resetAll = useCallback(() => {
    storage.clearAllData();
    setData({ shows: [] });
    setShareStore({});
    setRecentShows([]);
  }, []);

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
    const code = genShareCode();
    const payload: SharePayload = {
      kind: 'show', title: sh.title, type: sh.type, poster: sh.poster, tmdbId: sh.tmdbId,
      originCountry: sh.originCountry, wikiUrl: sh.wikiUrl, imdbUrl: sh.imdbUrl, cast: structuredClone(sh.cast),
    };
    setShareStore((prev) => {
      const next = { ...prev, [code]: { payload, createdAt: Date.now() } };
      storage.persistShares(next);
      return next;
    });
    return { code, title: sh.title, subtitle: `${sh.cast.length} cast members included`, photo: sh.poster, initials: initials(sh.title), color: sh.color };
  }, [data]);

  const shareCast = useCallback((showId: string, castId: string): ShareSheetState => {
    const sh = data.shows.find((x) => x.id === showId)!;
    const c = sh.cast.find((x) => x.id === castId)!;
    const code = genShareCode();
    const payload: SharePayload = { kind: 'cast', showTitle: sh.title, char: structuredClone(c) };
    setShareStore((prev) => {
      const next = { ...prev, [code]: { payload, createdAt: Date.now() } };
      storage.persistShares(next);
      return next;
    });
    return { code, title: c.name, subtitle: `From ${sh.title}`, photo: c.photo, initials: initials(c.name), color: c.color };
  }, [data]);

  const claimRedeem = useCallback((code: string, mode: 'show' | 'cast', activeShowId: string | null) => {
    const entry = shareStore[code.toUpperCase()];
    if (!entry) return { ok: false as const, error: 'No shared card found with that code.' };
    const payload = entry.payload;
    if (payload.kind !== mode) return { ok: false as const, error: `This code is for a ${payload.kind === 'show' ? 'show' : 'character'} card.` };
    if (payload.kind === 'show') {
      const newId = genId('s');
      updateData((d) => {
        const color = colorForIndex(d.shows.length);
        d.shows.push({
          id: newId, title: payload.title, type: payload.type, color, status: 'watching',
          cast: payload.cast.map((c) => ({ ...c, id: genId('p') })),
          poster: payload.poster, tmdbId: payload.tmdbId, originCountry: payload.originCountry,
          wikiUrl: payload.wikiUrl, imdbUrl: payload.imdbUrl,
        });
      });
      return { ok: true as const, newShowId: newId };
    } else {
      if (!activeShowId) return { ok: false as const, error: 'Open a show first, then redeem the character card into it.' };
      updateData((d) => {
        const s = d.shows.find((x) => x.id === activeShowId);
        if (!s) return;
        const color = colorForIndex(s.cast.length);
        s.cast.push({ ...structuredClone(payload.char), id: genId('p'), color } as CastMember);
      });
      return { ok: true as const };
    }
  }, [shareStore, updateData]);

  const value = useMemo<StoreValue>(() => ({
    data, settings, shareStore, recentShows, updateData, setTheme, setShowColumns, setCastColumns, setAutoSave,
    resetAll, pushRecent, showById, shareShow, shareCast, claimRedeem,
  }), [data, settings, shareStore, recentShows, updateData, setTheme, setShowColumns, setCastColumns, setAutoSave, resetAll, pushRecent, showById, shareShow, shareCast, claimRedeem]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}
