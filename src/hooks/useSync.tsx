import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import { useStore } from './useStore';
import { applyRemote, pull, push, saveCursor } from '../lib/sync';
import type { AppData } from '../types';
import { applyResolutions, findDuplicateGroups } from '../lib/duplicateShows';

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
 *   - leaving the page with an edit still waiting on that timer
 *
 * The last one is not a fourth schedule so much as a rescue of the third. A three-second debounce
 * and a tab that closes in two seconds means the timer dies with the page, and the edit stays on
 * that device until it is next opened — which is discovered on the other device, as work that
 * never arrived. Hiding is the signal that matters: switching apps, switching tabs and locking a
 * laptop all fire it while the page is still alive and able to finish the request. `pagehide` is
 * listened for as well, but it is the weaker of the two — on a real unload the browser may cancel
 * the request in flight, so it improves the odds rather than guaranteeing anything.
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

  /**
   * The exact object last handed to `push`, so "is anything waiting to be sent?" is a pointer
   * comparison. `updateData` clones on every edit, so a different identity is precisely the
   * question being asked, and asking it costs nothing on a path that runs as the page is closing.
   *
   * Null until the first push of this session: before that, anything on screen is unsent by
   * definition.
   */
  const pushed = useRef<AppData | null>(null);

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

      /**
       * Same show, two ids: resolved here, right after a pull and before the push below.
       *
       * A show added on two devices before they ever synced arrives as two unrelated records, so
       * this is the moment the duplicate first exists. Redundant copies are dropped in a *stamped*
       * update on purpose — that is what writes the tombstone, and without it the other device
       * would simply send the copy back on its next sync.
       *
       * Guarded by a read-only check because `updateData` clones and re-persists whether or not
       * the callback changes anything, and a new `data` identity restarts the debounce timer that
       * triggers this sync: calling it unconditionally would sync forever.
       */
      if (findDuplicateGroups(dataRef.current).length) {
        updateData((d) => { applyResolutions(d); });
      }

      // Advance past our own writes too, or the next pull hands them straight back.
      const snapshot = dataRef.current;
      const written = await push(snapshot, userId);
      if (written.newest) saveCursor(userId, written.newest);
      // What was sent, not when it was sent: the flush below compares identities, and a timestamp
      // could not tell an edit made during the request from one made before it.
      pushed.current = snapshot;
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

  /**
   * Send now, rather than in however much of the three seconds is left.
   *
   * Guarded on there being something to send: hiding a tab is common, and a device that has
   * changed nothing since its last push would otherwise spend a request every time the user
   * switched apps. The debounce timer is cleared as well, so an edit is never sent twice for the
   * same page visit.
   *
   * This runs the ordinary pull-then-push cycle rather than pushing straight out. A push on its
   * own is an unconditional upsert — the conflict rule lives in `applyRemote`, on the pull — so
   * skipping the pull to save a round trip would let a stale record overwrite a newer one from the
   * other device. Losing an edit is worse than missing this flush.
   */
  const flush = useCallback(() => {
    if (!userId) return;
    if (dataRef.current === pushed.current) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    void run();
  }, [userId, run]);

  // Arriving at the tab, and leaving it. Returning is the moment the other device is most likely
  // to have written; leaving is the last moment this one can say what it did.
  useEffect(() => {
    if (!userId) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void run();
      else flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    // Both, because neither covers the other. `visibilitychange` is what fires when an app is
    // switched away from or a laptop is closed, and leaves the page alive to finish the request;
    // `pagehide` is what fires on a navigation or a tab being closed, where `visibilitychange`
    // may not come at all. Firing twice costs nothing — the second call finds the first already
    // running, or nothing left to send.
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', flush);
    };
  }, [userId, run, flush]);

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
