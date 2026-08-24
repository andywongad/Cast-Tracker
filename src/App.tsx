import React, { useMemo, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './hooks/useStore';
import { UIProvider, useUI } from './hooks/useUI';
import { AuthProvider } from './hooks/useAuth';
import { SyncProvider } from './hooks/useSync';
import { isSyncConfigured } from './lib/supabase';
import { supabaseAuth, sessionFromUrl, onSessionChange } from './lib/authSupabase';
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
import { ShareSheet, RedeemSheet } from './components/ShareRedeem';
import WebViewOverlay from './components/WebViewOverlay';
import CastDetailSheet from './components/CastDetailSheet';
import AuthSheet from './components/AuthSheet';
import ShowMenuSheet from './components/ShowMenuSheet';

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

function Shell() {
  const { settings, storageFailed } = useStore();
  const { screen, activeShowId, openSettings } = useUI();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

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
      <main id="ct-scroll" className="ct-scroll" tabIndex={-1}>
        {screen === 'home' ? <HomeScreen /> : <ShowScreen key={activeShowId} />}
      </main>
      <WebViewOverlay />
      <CastDetailSheet />
      <ShareSheet />
      <RedeemSheet />
      <Footer />
      <SettingsSheet />
      <AuthSheet />
      <ShowMenuSheet />
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
