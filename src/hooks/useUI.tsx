import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

export interface ShowFormPrefill {
  title: string;
  type?: 'DRAMA' | 'REALITY' | 'VARIETY';
  poster?: string | null;
  tmdbId?: number | null;
  originCountry?: string;
}

export interface ShareSheetData {
  code: string;
  title: string;
  subtitle: string;
  photo: string | null;
  initials: string;
  color: string;
}

interface UIValue {
  screen: 'home' | 'show';
  activeShowId: string | null;
  openShow: (id: string) => void;
  goHome: () => void;

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

  redeem: { open: boolean; mode: 'show' | 'cast' };
  openRedeem: (mode: 'show' | 'cast') => void;
  closeRedeem: () => void;

  webView: { open: boolean; url: string; label: string };
  openWebView: (url: string, label: string) => void;
  closeWebView: () => void;
}

const UIContext = createContext<UIValue | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [screen, setScreen] = useState<'home' | 'show'>('home');
  const [activeShowId, setActiveShowId] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [addShowSheet, setAddShowSheet] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [addShowPrefill, setAddShowPrefill] = useState<ShowFormPrefill | null>(null);
  const [addCastSheet, setAddCastSheet] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [castDetailId, setCastDetailId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [converterOpen, setConverterOpen] = useState(false);
  const [converterPrefill, setConverterPrefill] = useState<{ fromCcy?: string; toCcy?: string; amount?: string } | null>(null);
  const [translatorOpen, setTranslatorOpen] = useState(false);
  const [shareSheet, setShareSheet] = useState<ShareSheetData | null>(null);
  const [redeem, setRedeem] = useState<{ open: boolean; mode: 'show' | 'cast' }>({ open: false, mode: 'show' });
  const [webView, setWebView] = useState<{ open: boolean; url: string; label: string }>({ open: false, url: '', label: '' });

  const openShow = useCallback((id: string) => { setScreen('show'); setActiveShowId(id); }, []);
  const goHome = useCallback(() => { setScreen('home'); }, []);

  const openAddShow = useCallback((prefill?: ShowFormPrefill) => { setAddShowPrefill(prefill || null); setAddShowSheet({ open: true, editingId: null }); }, []);
  const openEditShow = useCallback((id: string) => { setAddShowPrefill(null); setAddShowSheet({ open: true, editingId: id }); }, []);
  const closeAddShow = useCallback(() => setAddShowSheet({ open: false, editingId: null }), []);

  const openAddCast = useCallback(() => setAddCastSheet({ open: true, editingId: null }), []);
  const openEditCast = useCallback((id: string) => setAddCastSheet({ open: true, editingId: id }), []);
  const closeAddCast = useCallback(() => setAddCastSheet({ open: false, editingId: null }), []);

  const openCastDetail = useCallback((id: string) => setCastDetailId(id), []);
  const closeCastDetail = useCallback(() => setCastDetailId(null), []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const openConverter = useCallback((prefill?: { fromCcy?: string; toCcy?: string; amount?: string }) => {
    setConverterPrefill(prefill || null);
    setConverterOpen(true);
  }, []);
  const closeConverter = useCallback(() => setConverterOpen(false), []);

  const openTranslator = useCallback(() => setTranslatorOpen(true), []);
  const closeTranslator = useCallback(() => setTranslatorOpen(false), []);

  const openShareSheet = useCallback((data: ShareSheetData) => setShareSheet(data), []);
  const closeShareSheet = useCallback(() => setShareSheet(null), []);

  const openRedeem = useCallback((mode: 'show' | 'cast') => setRedeem({ open: true, mode }), []);
  const closeRedeem = useCallback(() => setRedeem((r) => ({ ...r, open: false })), []);

  const openWebView = useCallback((url: string, label: string) => setWebView({ open: true, url, label }), []);
  const closeWebView = useCallback(() => setWebView({ open: false, url: '', label: '' }), []);

  const value = useMemo<UIValue>(() => ({
    screen, activeShowId, openShow, goHome,
    query, setQuery,
    addShowSheet, addShowPrefill, openAddShow, openEditShow, closeAddShow,
    addCastSheet, openAddCast, openEditCast, closeAddCast,
    castDetailId, openCastDetail, closeCastDetail,
    settingsOpen, openSettings, closeSettings,
    converterOpen, converterPrefill, openConverter, closeConverter,
    translatorOpen, openTranslator, closeTranslator,
    shareSheet, openShareSheet, closeShareSheet,
    redeem, openRedeem, closeRedeem,
    webView, openWebView, closeWebView,
  }), [screen, activeShowId, query, addShowSheet, addShowPrefill, addCastSheet, castDetailId, settingsOpen, converterOpen,
      converterPrefill, translatorOpen, shareSheet, redeem, webView, openShow, goHome, openAddShow, openEditShow,
      closeAddShow, openAddCast, openEditCast, closeAddCast, openCastDetail, closeCastDetail, openSettings,
      closeSettings, openConverter, closeConverter, openTranslator, closeTranslator, openShareSheet,
      closeShareSheet, openRedeem, closeRedeem, openWebView, closeWebView]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
