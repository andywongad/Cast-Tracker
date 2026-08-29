import React, { useMemo, useEffect, useRef, useState } from 'react';
import { StoreProvider, useStore } from './hooks/useStore';
import { UIProvider, useUI } from './hooks/useUI';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { SyncProvider } from './hooks/useSync';
import { isSyncConfigured } from './lib/supabase';
import { supabaseAuth, sessionFromUrl, onSessionChange, lastExchangeError } from './lib/authSupabase';
import { consumeSignInLinkError, arrivedWithSignInCode, SIGN_IN_EXCHANGE_FAILED } from './lib/auth';
import { findDuplicateGroups, planResolution, applyResolutions } from './lib/duplicateShows';
import { takeShareFromUrl, decodeShare, type SharePacket } from './lib/shareLink';
import { THEMES, themeVars } from './lib/theme';
import { registerServiceWorker } from './lib/notifications';
import TopBar from './components/TopBar';
import Footer from './components/Footer';
import HomeScreen from './components/HomeScreen';
import ShowScreen from './components/ShowScreen';
import AddShowSheet from './components/AddShowSheet';
import AddCastSheet from './components/AddCastSheet';
import SettingsSheet from './components/SettingsSheet';
import FeedbackSheet from './components/FeedbackSheet';
import { ValueConverterSheet, TranslatorSheet } from './components/ConverterSheets';
import { ShareSheet } from './components/ShareRedeem';
import ShareImportSheet from './components/ShareImportSheet';
import WebViewOverlay from './components/WebViewOverlay';
import CastDetailSheet from './components/CastDetailSheet';
import NotedSheet from './components/NotedSheet';
import AuthSheet from './components/AuthSheet';
import ShowMenuSheet from './components/ShowMenuSheet';
import DuplicateShowsSheet from './components/DuplicateShowsSheet';
import PrivacySheet from './components/PrivacySheet';

/**
 * Shown when a save to localStorage fails, which in practice means the quota is full.
 *
 * Above the scroll area rather than inside a screen, because the moment it matters you could be
 * anywhere — adding cast, editing a character — and every one of those edits is now living only in
 * memory. It names the way out rather than just the problem: an export keeps the part that can't
 * be re-fetched, and clearing auto-loaded cast is what actually frees the space.
 */
function StorageFailedBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div
      role="alert"
      style={{
        flex: 'none', padding: '10px 16px', background: 'var(--danger)', color: 'var(--danger-text)',
        fontSize: 12.5, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>
        <strong>Changes aren&rsquo;t being saved.</strong> This device&rsquo;s storage is full, so
        anything you edit now will be gone when you reopen the app.
      </span>
      <button
        onClick={onOpenSettings}
        style={{
          flex: 'none', border: '1px solid color-mix(in oklch, var(--danger-text) 60%, transparent)', borderRadius: 9,
          background: 'transparent', color: 'var(--danger-text)', fontSize: 12, fontWeight: 700,
          padding: '7px 10px', cursor: 'pointer',
        }}
      >
        Free up space
      </button>
    </div>
  );
}

/**
 * Read at import time, not inside the component.
 *
 * `consumeSignInLinkError` strips the parameters as it reads them, so it answers only once — and a
 * `useState` initialiser is not once. StrictMode double-invokes it in development and React
 * remounts the tree, so the second call saw a URL this module had already cleaned and returned
 * null, which is how the first version of this managed to erase the message it existed to show.
 * Module scope runs exactly once per page load, which is the same lifetime as the URL itself.
 */
const INITIAL_SIGN_IN_ERROR = consumeSignInLinkError();
/** Also read at import time, and for the same reason: the auth client removes `code` as it runs. */
const ARRIVED_WITH_CODE = arrivedWithSignInCode();
/**
 * The share fragment, taken at import for the same reason as the sign-in code: `useUI` normalises
 * the URL on mount and would erase it before anything could read it. That bug cost a day once
 * already.
 */
const ARRIVING_SHARE = takeShareFromUrl();

/**
 * Shown when someone arrives from a sign-in link that didn't work.
 *
 * Read once at first paint, before anything can rewrite the URL — see `consumeSignInLinkError`.
 * It offers the way out rather than only naming the problem, because the fix is always the same:
 * ask for another link.
 */
function SignInFailedBar({ message, onRetry, onDismiss }: { message: string; onRetry: () => void; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      style={{
        flex: 'none', padding: '10px 16px', background: 'var(--danger)', color: 'var(--danger-text)',
        fontSize: 12.5, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onRetry}
        style={{
          flex: 'none', border: '1px solid color-mix(in oklch, var(--danger-text) 60%, transparent)', borderRadius: 9,
          background: 'transparent', color: 'var(--danger-text)', fontSize: 12, fontWeight: 700,
          padding: '7px 10px', cursor: 'pointer',
        }}
      >
        Try again
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{
          flex: 'none', border: 'none', background: 'transparent', color: 'var(--danger-text)',
          fontSize: 15, lineHeight: 1, padding: '6px 2px', cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

/**
 * Says a decision is waiting, without making it the first thing you deal with.
 *
 * Calm rather than red: nothing is broken and nothing is at risk — both copies are intact and stay
 * that way until asked. The bar exists because the alternative is a library quietly holding two of
 * the same show, which is how someone ends up writing notes into the copy that later loses.
 */
function DuplicateNoticeBar({ count, title, onResolve }: { count: number; title: string; onResolve: () => void }) {
  return (
    <div
      role="status"
      style={{
        flex: 'none', padding: '10px 16px', background: 'var(--accent-tint)', color: 'var(--text)',
        fontSize: 12.5, lineHeight: 1.45, display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ flex: 1 }}>
        {count === 1
          ? <>You have two copies of <strong>{title}</strong>, both with characters you wrote.</>
          : <>{count} shows have two copies each, both with characters you wrote.</>}
      </span>
      <button
        onClick={onResolve}
        style={{
          flex: 'none', border: '1px solid var(--input-border)', borderRadius: 9,
          background: 'var(--card)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700,
          padding: '7px 10px', cursor: 'pointer',
        }}
      >
        Sort out
      </button>
    </div>
  );
}

function Shell() {
  const { settings, storageFailed, data, updateData } = useStore();
  const { screen, activeShowId, openSettings, openAuth, openDuplicates } = useUI();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const { session, ready: authReady } = useAuth();
  const [dismissedSignInError, setDismissedSignInError] = useState(false);
  const [incomingShare, setIncomingShare] = useState<SharePacket | null>(null);

  // Decoding inflates, so it cannot happen during render. A link that fails to decode is silently
  // ignored: it is almost always one a messaging app truncated, and there is nothing to act on.
  useEffect(() => {
    if (!ARRIVING_SHARE) return;
    let alive = true;
    void decodeShare(ARRIVING_SHARE).then((packet) => { if (alive && packet) setIncomingShare(packet); });
    return () => { alive = false; };
  }, []);
  /**
   * Two ways a sign-in link fails, one message channel.
   *
   * The loud one arrives as `error` in the URL — a link already spent. The quiet one arrives as a
   * perfectly good `code` that no session comes of, which is what happens when the mail is opened
   * somewhere other than the browser that asked. Only the second needs the wait: it can only be
   * recognised once the auth client has finished looking, and before that "no session" is just
   * "not yet".
   */
  const signInError = dismissedSignInError
    ? null
    : INITIAL_SIGN_IN_ERROR ??
      (ARRIVED_WITH_CODE && authReady && !session
        // The library's own reason, appended. Ugly in a product sense, and worth it: without it
        // this bar can only say that something failed, which is where the last three wrong guesses
        // came from. It is also a string a tester can read back over a call.
        ? [SIGN_IN_EXCHANGE_FAILED, lastExchangeError()].filter(Boolean).join(' — ')
        : null);

  /**
   * Only the groups the app refuses to resolve on its own — two copies of a show, both holding
   * records the user wrote. Everything else is deleted during sync without a word, because a copy
   * with nothing of yours in it is not a decision.
   */
  const dataRef = useRef(data);
  dataRef.current = data;

  const contestedDuplicates = useMemo(
    () => findDuplicateGroups(data).filter((g) => planResolution(g) === null),
    [data],
  );

  /**
   * The same tidy-up as the one in the sync engine, for the duplicates sync never sees: a show
   * added twice on one device, or a backup imported over a library that already had it.
   *
   * Once on mount, and only when there is something to do — `updateData` re-persists whether or
   * not the callback changes anything, and doing that on every render would be a write per frame.
   * Deleting only ever takes copies holding nothing of the user's; anything contested is left for
   * the bar above.
   */
  useEffect(() => {
    if (findDuplicateGroups(dataRef.current).some((g) => planResolution(g) !== null)) {
      updateData((d) => { applyResolutions(d); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    registerServiceWorker();
  }, []);

  /**
   * Size the app to the *visual* viewport rather than 100dvh.
   *
   * On iOS Safari an open keyboard doesn't shrink the layout viewport, so 100dvh keeps reporting
   * the full screen and the keyboard simply covers the bottom of the app — search results included.
   * visualViewport reports what's actually visible and fires on keyboard open/close.
   *
   * The keyboard flag drives hiding the bottom nav while typing: it sits under the keyboard, so
   * it's unreachable anyway, and dropping it returns ~76px to the results.
   */
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
      // A large gap between layout and visual viewport means a software keyboard, not a browser
      // chrome change — 120px is comfortably above toolbar hide/show, below any real keyboard.
      setKeyboardOpen(vv ? window.innerHeight - vv.height > 120 : false);
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);

  const themeName = settings.theme ?? 'Light';
  const t = THEMES[themeName];
  const rootStyle = useMemo(() => ({
    // Height deliberately omitted: .ct-app uses height: var(--app-h, 100dvh), and an inline
    // height here would override it — which is exactly why the visual-viewport sizing had no effect.
    position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: t.bg, color: t.text,
    ...themeVars(t),
  }) as React.CSSProperties, [t]);

  return (
    <div className="ct-app" data-keyboard={keyboardOpen ? 'open' : undefined} style={rootStyle}>
      {/* Landmarks. There were none — no main, no nav, no header — so a screen-reader user had no
          way to move between the regions of the app and had to walk it linearly every time. */}
      <a className="ct-skip-link" href="#ct-scroll">Skip to content</a>
      <TopBar />
      {storageFailed && <StorageFailedBar onOpenSettings={openSettings} />}
      {contestedDuplicates.length > 0 && (
        <DuplicateNoticeBar count={contestedDuplicates.length} title={contestedDuplicates[0].title} onResolve={openDuplicates} />
      )}
      {signInError && (
        <SignInFailedBar
          message={signInError}
          onRetry={() => { setDismissedSignInError(true); openAuth(); }}
          onDismiss={() => setDismissedSignInError(true)}
        />
      )}
      <main id="ct-scroll" className="ct-scroll" tabIndex={-1}>
        {screen === 'home' ? <HomeScreen /> : <ShowScreen key={activeShowId} />}
      </main>
      <WebViewOverlay />
      <CastDetailSheet />
      <NotedSheet />
      <ShareSheet />
      <ShareImportSheet packet={incomingShare} onDone={() => setIncomingShare(null)} />
      <Footer />
      <SettingsSheet />
      <AuthSheet />
      <ShowMenuSheet />
      <DuplicateShowsSheet />
      <PrivacySheet />
      <FeedbackSheet />
      <ValueConverterSheet />
      <TranslatorSheet />
      <AddShowSheet />
      <AddCastSheet />
    </div>
  );
}

/**
 * The real adapter when this deployment has Supabase, the stub otherwise.
 *
 * Defined at module scope, not inline: passing fresh function identities on every render would
 * re-run the bootstrap and re-subscribe each time anything above re-rendered.
 */
const live = isSyncConfigured();
const authProps = live
  ? { adapter: supabaseAuth, bootstrap: sessionFromUrl, subscribe: onSessionChange }
  : {};

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <AuthProvider {...authProps}>
          {/* Inside AuthProvider because it keys off the session, and inside StoreProvider because
              it both reads and writes the library. */}
          <SyncProvider>
            <Shell />
          </SyncProvider>
        </AuthProvider>
      </UIProvider>
    </StoreProvider>
  );
}
