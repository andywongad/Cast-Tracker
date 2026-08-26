import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useStore } from './useStore';

export interface ShowFormPrefill {
  title: string;
  type?: 'DRAMA' | 'REALITY' | 'VARIETY';
  poster?: string | null;
  tmdbId?: number | null;
  originCountry?: string;
}

export interface ShareSheetData {
  /** The payload the link carries. Encoding happens in the sheet, because it is async. */
  packet: import('../lib/shareLink').SharePacket;
  title: string;
  subtitle: string;
  photo: string | null;
  initials: string;
  color: string;
}

/**
 * One entry per thing the user can back out of.
 *
 * Everything the app puts on screen above the home grid is a layer, and the layer stack *is* the
 * browser history: opening pushes an entry, closing consumes one, and the system back gesture
 * pops exactly like a close button does. Before this the whole navigation model was loose
 * `useState` flags with no history involvement at all, so on Android — and in an installed PWA,
 * where there is no browser chrome to fall back on — back exited the app from anywhere, however
 * deep you were.
 *
 * Layers carry only small serialisable identity (ids, modes, urls). Bulkier payloads — a share
 * code, an add-show prefill — stay in React state, because history entries survive a reload and a
 * regenerated share code shouldn't come back from the dead. Their sheets already no-op when the
 * payload is missing.
 */
type Layer =
  | { k: 'show'; id: string }
  | { k: 'castDetail'; id: string }
  | { k: 'addShow'; editingId: string | null }
  | { k: 'addCast'; editingId: string | null }
  | { k: 'settings' }
  | { k: 'auth' }
  | { k: 'duplicates' }
  | { k: 'showMenu' }
  | { k: 'feedback' }
  | { k: 'converter' }
  | { k: 'translator' }
  | { k: 'share' }
  | { k: 'webView'; url: string; label: string }
  /** The previous episode's recap. Carries which episode it is *about*, not the one you're on. */
  | { k: 'recap'; season: number; episode: number };

/** Namespaced so anything else that lands in history.state is left alone. */
const STATE_KEY = 'ct.nav';

/**
 * Only the show layer reaches the URL, as `?show=<id>`.
 *
 * A query parameter rather than a path segment because this is a static Vite deploy with no SPA
 * rewrite: `/show/abc` returns Vercel's 404 on refresh (verified against the live site), whereas
 * the path here stays `/` and a refresh is served normally. Deep links come free as a result.
 * Sheets deliberately get no URL — they're transient, and a URL that reopens a half-filled form
 * is worse than one that doesn't.
 */
function urlFor(stack: Layer[]): string {
  const show = [...stack].reverse().find((l): l is Extract<Layer, { k: 'show' }> => l.k === 'show');
  return show ? `${window.location.pathname}?show=${encodeURIComponent(show.id)}` : window.location.pathname;
}

function lastOf<K extends Layer['k']>(stack: Layer[], k: K): Extract<Layer, { k: K }> | undefined {
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].k === k) return stack[i] as Extract<Layer, { k: K }>;
  return undefined;
}

interface UIValue {
  screen: 'home' | 'show';
  activeShowId: string | null;
  openShow: (id: string) => void;
  goHome: () => void;
  /** Unwind to the home screen in one step, for when the data behind the stack is gone. */
  resetToHome: () => void;

  query: string;
  setQuery: (q: string) => void;

  addShowSheet: { open: boolean; editingId: string | null };
  addShowPrefill: ShowFormPrefill | null;
  openAddShow: (prefill?: ShowFormPrefill) => void;
  openEditShow: (id: string) => void;
  closeAddShow: () => void;

  addCastSheet: { open: boolean; editingId: string | null };
  openAddCast: () => void;
  openEditCast: (id: string) => void;
  closeAddCast: () => void;

  castDetailId: string | null;
  openCastDetail: (id: string) => void;
  closeCastDetail: () => void;

  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  authOpen: boolean;
  openAuth: () => void;
  closeAuth: () => void;
  duplicatesOpen: boolean;
  openDuplicates: () => void;
  closeDuplicates: () => void;
  showMenuOpen: boolean;
  openShowMenu: () => void;
  closeShowMenu: () => void;

  feedbackOpen: boolean;
  openFeedback: () => void;
  closeFeedback: () => void;

  converterOpen: boolean;
  converterPrefill: { fromCcy?: string; toCcy?: string; amount?: string } | null;
  openConverter: (prefill?: { fromCcy?: string; toCcy?: string; amount?: string }) => void;
  closeConverter: () => void;

  translatorOpen: boolean;
  openTranslator: () => void;
  closeTranslator: () => void;

  shareSheet: ShareSheetData | null;
  openShareSheet: (data: ShareSheetData) => void;
  closeShareSheet: () => void;


  webView: { open: boolean; url: string; label: string };
  openWebView: (url: string, label: string) => void;
  closeWebView: () => void;

  recap: { open: boolean; season: number; episode: number };
  openRecap: (season: number, episode: number) => void;
  closeRecap: () => void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const { data } = useStore();
  const [query, setQuery] = useState('');

  // Payloads too big or too perishable to live in a history entry. See the Layer doc comment.
  const [addShowPrefill, setAddShowPrefill] = useState<ShowFormPrefill | null>(null);
  const [converterPrefill, setConverterPrefill] = useState<{ fromCcy?: string; toCcy?: string; amount?: string } | null>(null);
  const [shareData, setShareData] = useState<ShareSheetData | null>(null);

  /**
   * Drop layers pointing at records that no longer exist.
   *
   * History outlives the data it refers to: delete a show, or reset the app from Settings, and the
   * entries behind you still name it. Without this, back would land on a show screen whose show is
   * gone — TopBar with an empty title over an empty page.
   */
  const dataRef = useRef(data);
  dataRef.current = data;
  const sanitize = useCallback((stack: Layer[]): Layer[] => {
    const shows = dataRef.current.shows;
    const out: Layer[] = [];
    for (const l of stack) {
      if (l.k === 'show' && !shows.some((s) => s.id === l.id)) continue;
      // A character sheet is meaningless without the show it belongs to.
      if (l.k === 'castDetail') {
        const showLayer = lastOf(out, 'show');
        const sh = showLayer && shows.find((s) => s.id === showLayer.id);
        if (!sh || !sh.cast.some((c) => c.id === l.id)) continue;
      }
      out.push(l);
    }
    return out;
  }, []);

  const [stack, setStack] = useState<Layer[]>(() => {
    const id = new URLSearchParams(window.location.search).get('show');
    return id && data.shows.some((s) => s.id === id) ? [{ k: 'show', id }] : [];
  });
  const stackRef = useRef(stack);

  const apply = useCallback((next: Layer[], mode: 'push' | 'replace') => {
    stackRef.current = next;
    setStack(next);
    const state = { [STATE_KEY]: next };
    if (mode === 'push') window.history.pushState(state, '', urlFor(next));
    else window.history.replaceState(state, '', urlFor(next));
  }, []);

  /**
   * Seed the entry the app loaded on, and normalise the URL.
   *
   * Deriving the opening stack from the URL rather than from a restored `history.state` is
   * deliberate: reloading with a sheet open should land on the show, not reopen the sheet.
   */
  useEffect(() => {
    apply(stackRef.current, 'replace');
  }, [apply]);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const raw = (e.state as Record<string, unknown> | null)?.[STATE_KEY];
      const next = sanitize(Array.isArray(raw) ? (raw as Layer[]) : []);
      stackRef.current = next;
      setStack(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sanitize]);

  /**
   * Closing is a real history traversal, not a state edit, so that back and a close button consume
   * the same entry. Editing the current entry in place instead would leave a dead entry behind and
   * make the first back press after every close do nothing.
   *
   * `history.back()` is asynchronous, which matters for the handfuls of places that close one
   * sheet and open another in a single tick (the ⋯ menu's rows, redeeming a code into a new show,
   * the character sheet's edit button). Firing back() and pushState() together would interleave
   * badly. Deferring by a microtask lets an open() that lands in the same tick cancel the pending
   * back and become a swap of the top layer — which is also the right history shape: back from
   * the sheet you were sent to returns to what was under the one you came from.
   */
  const pendingPop = useRef(false);
  const pop = useCallback(() => {
    if (!stackRef.current.length) return;
    pendingPop.current = true;
    queueMicrotask(() => {
      if (!pendingPop.current) return;
      pendingPop.current = false;
      window.history.back();
    });
  }, []);

  const push = useCallback((layer: Layer) => {
    if (pendingPop.current) {
      pendingPop.current = false;
      apply([...stackRef.current.slice(0, -1), layer], 'replace');
    } else {
      apply([...stackRef.current, layer], 'push');
    }
  }, [apply]);

  const openShow = useCallback((id: string) => push({ k: 'show', id }), [push]);
  const goHome = useCallback(() => pop(), [pop]);
  const resetToHome = useCallback(() => { pendingPop.current = false; apply([], 'replace'); }, [apply]);

  const openAddShow = useCallback((prefill?: ShowFormPrefill) => { setAddShowPrefill(prefill || null); push({ k: 'addShow', editingId: null }); }, [push]);
  const openEditShow = useCallback((id: string) => { setAddShowPrefill(null); push({ k: 'addShow', editingId: id }); }, [push]);
  const closeAddShow = useCallback(() => pop(), [pop]);

  const openAddCast = useCallback(() => push({ k: 'addCast', editingId: null }), [push]);
  const openEditCast = useCallback((id: string) => push({ k: 'addCast', editingId: id }), [push]);
  const closeAddCast = useCallback(() => pop(), [pop]);

  const openCastDetail = useCallback((id: string) => push({ k: 'castDetail', id }), [push]);
  const closeCastDetail = useCallback(() => pop(), [pop]);

  const openSettings = useCallback(() => push({ k: 'settings' }), [push]);
  const closeSettings = useCallback(() => pop(), [pop]);

  // Signing in replaces Settings rather than stacking on it, matching how it always behaved.
  const openAuth = useCallback(() => { pop(); push({ k: 'auth' }); }, [pop, push]);
  const closeAuth = useCallback(() => pop(), [pop]);
  const openDuplicates = useCallback(() => { pop(); push({ k: 'duplicates' }); }, [pop, push]);
  const closeDuplicates = useCallback(() => pop(), [pop]);

  const openShowMenu = useCallback(() => push({ k: 'showMenu' }), [push]);
  const closeShowMenu = useCallback(() => pop(), [pop]);

  const openFeedback = useCallback(() => push({ k: 'feedback' }), [push]);
  const closeFeedback = useCallback(() => pop(), [pop]);

  const openConverter = useCallback((prefill?: { fromCcy?: string; toCcy?: string; amount?: string }) => {
    setConverterPrefill(prefill || null);
    push({ k: 'converter' });
  }, [push]);
  const closeConverter = useCallback(() => pop(), [pop]);

  const openTranslator = useCallback(() => push({ k: 'translator' }), [push]);
  const closeTranslator = useCallback(() => pop(), [pop]);

  const openShareSheet = useCallback((d: ShareSheetData) => { setShareData(d); push({ k: 'share' }); }, [push]);
  const closeShareSheet = useCallback(() => pop(), [pop]);


  const openWebView = useCallback((url: string, label: string) => push({ k: 'webView', url, label }), [push]);
  const closeWebView = useCallback(() => pop(), [pop]);

  const openRecap = useCallback((season: number, episode: number) => push({ k: 'recap', season, episode }), [push]);
  const closeRecap = useCallback(() => pop(), [pop]);

  // Every flag the app used to hold separately is now read off the stack, so there is exactly one
  // source of truth for what's on screen and it's the same one the back gesture manipulates.
  const derived = useMemo(() => {
    const showLayer = lastOf(stack, 'show');
    const addShow = lastOf(stack, 'addShow');
    const addCast = lastOf(stack, 'addCast');
    const castDetail = lastOf(stack, 'castDetail');
    const webViewLayer = lastOf(stack, 'webView');
    const recapLayer = lastOf(stack, 'recap');
    return {
      screen: (showLayer ? 'show' : 'home') as 'home' | 'show',
      activeShowId: showLayer?.id ?? null,
      addShowSheet: { open: !!addShow, editingId: addShow?.editingId ?? null },
      addCastSheet: { open: !!addCast, editingId: addCast?.editingId ?? null },
      castDetailId: castDetail?.id ?? null,
      settingsOpen: stack.some((l) => l.k === 'settings'),
      authOpen: stack.some((l) => l.k === 'auth'),
      duplicatesOpen: stack.some((l) => l.k === 'duplicates'),
      showMenuOpen: stack.some((l) => l.k === 'showMenu'),
      feedbackOpen: stack.some((l) => l.k === 'feedback'),
      converterOpen: stack.some((l) => l.k === 'converter'),
      translatorOpen: stack.some((l) => l.k === 'translator'),
      shareOpen: stack.some((l) => l.k === 'share'),
          webView: { open: !!webViewLayer, url: webViewLayer?.url ?? '', label: webViewLayer?.label ?? '' },
      recap: { open: !!recapLayer, season: recapLayer?.season ?? 0, episode: recapLayer?.episode ?? 0 },
    };
  }, [stack]);

  const value = useMemo<UIValue>(() => ({
    screen: derived.screen,
    activeShowId: derived.activeShowId,
    openShow, goHome, resetToHome,
    query, setQuery,
    addShowSheet: derived.addShowSheet, addShowPrefill, openAddShow, openEditShow, closeAddShow,
    addCastSheet: derived.addCastSheet, openAddCast, openEditCast, closeAddCast,
    castDetailId: derived.castDetailId, openCastDetail, closeCastDetail,
    settingsOpen: derived.settingsOpen, openSettings, closeSettings,
    authOpen: derived.authOpen, openAuth, closeAuth,
    duplicatesOpen: derived.duplicatesOpen, openDuplicates, closeDuplicates,
    showMenuOpen: derived.showMenuOpen, openShowMenu, closeShowMenu,
    feedbackOpen: derived.feedbackOpen, openFeedback, closeFeedback,
    converterOpen: derived.converterOpen, converterPrefill, openConverter, closeConverter,
    translatorOpen: derived.translatorOpen, openTranslator, closeTranslator,
    shareSheet: derived.shareOpen ? shareData : null, openShareSheet, closeShareSheet,
    webView: derived.webView, openWebView, closeWebView,
    recap: derived.recap, openRecap, closeRecap,
  }), [derived, query, addShowPrefill, converterPrefill, shareData,
      openShow, goHome, resetToHome, openAddShow, openEditShow, closeAddShow,
      openAddCast, openEditCast, closeAddCast, openCastDetail, closeCastDetail,
      openSettings, closeSettings, openAuth, closeAuth, openDuplicates, closeDuplicates, openShowMenu, closeShowMenu,
      openFeedback, closeFeedback, openConverter, closeConverter, openTranslator, closeTranslator,
      openShareSheet, closeShareSheet, openWebView, closeWebView,
      openRecap, closeRecap]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
