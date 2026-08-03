import React, { useMemo, useEffect } from 'react';
import { StoreProvider, useStore } from './hooks/useStore';
import { UIProvider, useUI } from './hooks/useUI';
import { THEMES } from './lib/theme';
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

function Shell() {
  const { settings } = useStore();
  const { screen, activeShowId } = useUI();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const themeName = settings.theme ?? 'Light';
  const t = THEMES[themeName];
  const rootStyle: React.CSSProperties = useMemo(() => ({
    position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: t.bg, color: t.text,
    ['--bg' as any]: t.bg, ['--card' as any]: t.card, ['--sheet' as any]: t.sheet, ['--surface' as any]: t.surface,
    ['--border' as any]: t.border, ['--input-border' as any]: t.inputBorder, ['--divider' as any]: t.divider,
    ['--text' as any]: t.text, ['--text-muted' as any]: t.textMuted, ['--text-secondary' as any]: t.textSecondary,
    ['--text-tertiary' as any]: t.textTertiary, ['--text-faint' as any]: t.textFaint, ['--icon-muted' as any]: t.iconMuted,
    ['--accent-soft' as any]: t.accentSoft, ['--initials-tint' as any]: t.initialsTint, ['--scrim' as any]: t.scrim,
  }), [t]);

  return (
    <div className="ct-app" style={rootStyle}>
      <TopBar />
      <div id="ct-scroll" className="ct-scroll">
        {screen === 'home' ? <HomeScreen /> : <ShowScreen key={activeShowId} />}
      </div>
      <WebViewOverlay />
      <CastDetailSheet />
      <ShareSheet />
      <RedeemSheet />
      <Footer />
      <SettingsSheet />
      <FeedbackSheet />
      <ValueConverterSheet />
      <TranslatorSheet />
      <AddShowSheet />
      <AddCastSheet />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <UIProvider>
        <Shell />
      </UIProvider>
    </StoreProvider>
  );
}
