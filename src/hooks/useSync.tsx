import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useStore } from './useStore';
import { applyRemote, pull, push, saveCursor } from '../lib/sync';

/**
 * When sync runs.
 *
 * Nothing here is on a timer. A background poll would spend requests on the overwhelming majority
 * of minutes in which nothing has changed on either side, and would still be too slow at the one
 * moment that matters — picking up your phone after editing on a laptop. So it runs at the three
 * points where the answer can actually have changed:
 *
 *   - signing in, or opening the app already signed in
 *   - coming back to the tab, which is exactly when the other device may have written something
 *   - a few seconds after you stop editing
 *
 * Order is always pull, then push. Pulling first means a conflict is resolved against what the
 * server already has rather than being overwritten by this device and discovered later; the merge
 * is per-record last-write-wins either way, but doing it in this order keeps the losing edit
 * visible on screen instead of gone before it was ever compared.
 */

/** How long to wait after the last edit. Long enough to cover a burst of typing in one request. */
const QUIET_MS = 3000;

export type SyncState = 'off' | 'idle' | 'syncing' | 'error';

function useSyncEngine() {
  const { session } = useAuth();
  const { data, updateData } = useStore();
  const [state, setState] = useState<SyncState>('off');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [error, setError] = useState('');

  /**
   * The data is read through a ref rather than closed over.
   *
   * A push scheduled three seconds ago must send what is on screen now, not what was there when
   * the timer started — otherwise the last few edits of a burst are dropped until something else
   * happens to trigger a sync. Keeping it in a ref also stops every keystroke from tearing down
   * and rebuilding the timer.
   */
  const dataRef = useRef(data);
  dataRef.current = data;

  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = session?.userId ?? null;

  const run = useCallback(async () => {
    if (!userId || running.current) return;
    running.current = true;
    setState('syncing');
    setError('');
    try {
      const { rows, newest } = await pull(userId);
      if (rows.length) {
        /**
         * Applied only if it actually changes something.
         *
         * `updateData` clones, so calling it always produces a new `data` identity even when the
         * merge is a no-op — and a new identity restarts the debounce timer, which syncs, which
         * lands here again. A second guard against the same loop the cursor below closes, because
         * a sync that quietly runs forever costs the user's battery and says nothing.
         */
        updateData((d) => {
          const merged = applyRemote(d, rows);
          if (JSON.stringify(merged.shows) !== JSON.stringify(d.shows)) d.shows = merged.shows;
        }, { stamp: false });
      }
      // Saved only after the merge is applied. Saving on receipt would mean a failure in between
      // lost those rows for good — the cursor would have moved past them.
      if (newest) saveCursor(userId, newest);

      // Advance past our own writes too, or the next pull hands them straight back.
      const written = await push(dataRef.current, userId);
      if (written.newest) saveCursor(userId, written.newest);
      setState('idle');
      setLastSyncedAt(Date.now());
    } catch (e) {
      // Left for the next trigger rather than retried on a timer. Every entry point below will
      // try again, and a device that is offline should not spend its battery discovering that.
      setState('error');
      setError(e instanceof Error ? e.message : 'Sync failed.');
    } finally {
      running.current = false;
    }
  }, [userId, updateData]);

  // Signing in, or opening the app already signed in.
  useEffect(() => {
    if (!userId) { setState('off'); return; }
    void run();
  }, [userId, run]);

  // Returning to the tab. The one moment the other device is most likely to have written.
  useEffect(() => {
    if (!userId) return;
    const onVisible = () => { if (document.visibilityState === 'visible') void run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, run]);

  // A few seconds after the last edit.
  useEffect(() => {
    if (!userId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), QUIET_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [data, userId, run]);

  return { state, lastSyncedAt, error, syncNow: run };
}

interface SyncValue {
  state: SyncState;
  lastSyncedAt: number | null;
  error: string;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncValue | null>(null);

/**
 * Runs the engine once for the whole app and shares its state.
 *
 * A hook called in two places would mean two independent schedules pushing the same library, so
 * the engine lives here and everything else reads it.
 */
export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { state, lastSyncedAt, error, syncNow } = useSyncEngine();
  const value = useMemo(() => ({ state, lastSyncedAt, error, syncNow }), [state, lastSyncedAt, error, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Sync status, or nulls where sync isn't configured. Safe to call anywhere. */
export function useSync(): SyncValue {
  return useContext(SyncContext) ?? { state: 'off', lastSyncedAt: null, error: '', syncNow: async () => {} };
}
