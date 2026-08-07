import { useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';

export default function SettingsSheet() {
  const { settings, setTheme, setShowColumns, setCastColumns, setAutoSave, exportBackup, importBackup, resetAll } = useStore();
  const { settingsOpen, closeSettings, screen, goHome, openFeedback } = useUI();
  const [resetConfirm, setResetConfirm] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!settingsOpen) return null;
  const theme = settings.theme ?? 'Light';

  const doReset = () => { resetAll(); setResetConfirm(false); closeSettings(); goHome(); };

  const doExport = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `cast-tracker-backup-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (!window.confirm('Importing replaces all shows and cast currently on this device. Continue?')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importBackup(String(reader.result || ''));
      setImportMsg(res.ok ? { ok: true, text: '✓ Backup restored.' } : { ok: false, text: res.error });
    };
    reader.onerror = () => setImportMsg({ ok: false, text: 'Couldn’t read that file.' });
    reader.readAsText(file);
  };

  return (
    <div className="ct-scrim" onClick={closeSettings}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <div className="ct-sheet-title">Settings</div>

        <label className="ct-label-muted">APPEARANCE</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {(['Light', 'Dark'] as const).map((th) => (
            <button key={th} onClick={() => setTheme(th)} className={`ct-tab-btn${theme === th ? ' is-active' : ''}`}>{th}</button>
          ))}
        </div>

        <label className="ct-label-muted">CHARACTER EDITING</label>
        <button onClick={() => setAutoSave(!settings.autoSave)} style={{ width: '100%', height: 44, marginBottom: 22, border: '1px solid var(--input-border)', borderRadius: 12, background: settings.autoSave ? 'var(--text)' : 'transparent', color: settings.autoSave ? '#fff' : 'var(--text-secondary)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' }}>
          {settings.autoSave ? '✓ Auto-Save Enabled' : 'Auto-Save Disabled'}
        </button>

        {screen === 'home' && (
          <>
            <label className="ct-label-muted">COLUMNS &middot; HOMEPAGE SHOWS</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {[2, 3, 4].map((n) => (
                <button key={n} onClick={() => setShowColumns(n)} className={`ct-tab-btn${settings.showColumns === n ? ' is-active' : ''}`}>{n}</button>
              ))}
            </div>
          </>
        )}

        {screen === 'show' && (
          <>
            <label className="ct-label-muted">COLUMNS &middot; CAST GRID</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {[2, 3].map((n) => (
                <button key={n} onClick={() => setCastColumns(n)} className={`ct-tab-btn${settings.castColumns === n ? ' is-active' : ''}`}>{n}</button>
              ))}
            </div>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

        <label className="ct-label-muted">BACKUP</label>
        <div style={{ fontSize: 11.5, color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 10 }}>Your data lives only on this device. Export a backup file to keep it safe or move it to another device.</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬇ Export</button>
          <button onClick={() => fileInputRef.current?.click()} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬆ Import</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: 'none' }} />
        </div>
        {importMsg && <div style={{ fontSize: 12, fontWeight: 700, color: importMsg.ok ? 'var(--accent-soft)' : '#C24B4B', marginBottom: 14 }}>{importMsg.text}</div>}

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

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

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 0', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tmdbGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#90cea1" /><stop offset="0.56" stopColor="#3cbec9" /><stop offset="1" stopColor="#00b3e5" /></linearGradient></defs><rect width="24" height="24" rx="5" fill="url(#tmdbGrad)" /></svg>
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent-soft)', textDecoration: 'none' }}>The Movie Database</a>
          </div>
          <div style={{ fontSize: 10.5, color: 'var(--text-faint)', lineHeight: 1.5, textAlign: 'center' }}>
            Show &amp; cast data provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </div>
        </div>
      </div>
    </div>
  );
}
