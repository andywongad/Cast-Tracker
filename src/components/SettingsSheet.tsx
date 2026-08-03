import { useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';

export default function SettingsSheet() {
  const { settings, setTheme, setShowColumns, setCastColumns, resetAll } = useStore();
  const { settingsOpen, closeSettings, screen, goHome, openFeedback } = useUI();
  const [resetConfirm, setResetConfirm] = useState(false);

  if (!settingsOpen) return null;
  const theme = settings.theme ?? 'Light';

  const doReset = () => { resetAll(); setResetConfirm(false); closeSettings(); goHome(); };

  return (
    <div className="ct-scrim" onClick={closeSettings}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <div className="ct-sheet-title">Settings</div>

        <label className="ct-label-muted">APPEARANCE</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {(['Light', 'Dark'] as const).map((th) => (
            <button key={th} onClick={() => setTheme(th)} className="ct-tab-btn" style={{ border: theme === th ? 'none' : '1px solid var(--input-border)', background: theme === th ? '#6366F1' : 'transparent', color: theme === th ? '#fff' : 'var(--text-secondary)' }}>{th}</button>
          ))}
        </div>

        {screen === 'home' && (
          <>
            <label className="ct-label-muted">COLUMNS &middot; HOMEPAGE SHOWS</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => setShowColumns(n)} className="ct-tab-btn" style={{ border: settings.showColumns === n ? 'none' : '1px solid var(--input-border)', background: settings.showColumns === n ? '#6366F1' : 'transparent', color: settings.showColumns === n ? '#fff' : 'var(--text-secondary)' }}>{n}</button>
              ))}
            </div>
          </>
        )}

        {screen === 'show' && (
          <>
            <label className="ct-label-muted">COLUMNS &middot; CAST GRID</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[2, 3].map((n) => (
                <button key={n} onClick={() => setCastColumns(n)} className="ct-tab-btn" style={{ border: settings.castColumns === n ? 'none' : '1px solid var(--input-border)', background: settings.castColumns === n ? '#6366F1' : 'transparent', color: settings.castColumns === n ? '#fff' : 'var(--text-secondary)' }}>{n}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

        <button onClick={openFeedback} className="ct-btn-ghost" style={{ width: '100%', height: 44, marginBottom: 8 }}>💬 Send Feedback</button>

        {resetConfirm ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>This clears all shows, cast, shares, and recents &mdash; can&rsquo;t be undone.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setResetConfirm(false)} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>Cancel</button>
              <button onClick={doReset} style={{ flex: 1, height: 44, borderRadius: 12, border: 'none', background: '#C24B4B', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Yes, reset</button>
            </div>
          </>
        ) : (
          <button onClick={() => setResetConfirm(true)} className="ct-btn-ghost" style={{ width: '100%', height: 44, color: '#C24B4B' }}>Reset to blank state</button>
        )}
      </div>
    </div>
  );
}
