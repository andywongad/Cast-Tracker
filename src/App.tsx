import React, { useMemo, useEffect } from 'react';
import { StoreProvider, useStore } from './hooks/useStore';
import { UIProvider, useUI } from './hooks/useUI';
import { AuthProvider } from './hooks/useAuth';
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

function Shell() {
  const { settings } = useStore();
  const { screen, activeShowId } = useUI();

  useEffect(() => {
    registerServiceWorker();
  }, []);

  const themeName = settings.theme ?? 'Light';
  const t = THEMES[themeName];
  const rootStyle = useMemo(() => ({
    position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    background: t.bg, color: t.text,
    ...themeVars(t),
  }) as React.CSSProperties, [t]);

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
      <AuthSheet />
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
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </UIProvider>
    </StoreProvider>
  );
}
