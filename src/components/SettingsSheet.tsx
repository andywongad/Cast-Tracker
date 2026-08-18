import { useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { isAuthPreviewEnabled } from '../lib/auth';
import Sheet from './Sheet';

export default function SettingsSheet() {
  const { settings, setTheme, setAutoSave, exportBackup, importBackup, resetAll, backupState, keptTotal } = useStore();
  const { session } = useAuth();
  const { settingsOpen, closeSettings, resetToHome, openFeedback, openAuth } = useUI();
  const [resetConfirm, setResetConfirm] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!settingsOpen) return null;
  const theme = settings.theme ?? 'Light';

  // Closing the sheet and going home are two layers, and a reset destroys everything the entries
  // behind them refer to. One step straight to the root rather than two traversals through
  // history that would each land on a show that no longer exists.
  const doReset = () => { resetAll(); setResetConfirm(false); resetToHome(); };

  const doExport = () => {
    const backup = exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `cast-tracker-backup-${stamp}.json`;
    a.click();
    // Revoked on the next tick, not inline. Chrome reads the blob during the click, but Safari and
    // Firefox have both been observed cancelling the download when the URL is released in the same
    // synchronous block — and a backup that silently doesn't arrive is the worst possible bug here.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  /**
   * The safe path is one tap, not two.
   *
   * Reset wipes shows, cast, shares and recents with no recovery — this is device-only storage and
   * there is no history to roll back to. Offering "export" and "reset" as separate buttons means
   * the destructive one is always the shorter route, and the moment somebody is reaching for reset
   * is exactly when they are least inclined to detour. So the primary action does both, in order.
   */
  const doExportThenReset = () => { doExport(); doReset(); };

  const lastBackup = backupState.lastExportAt;
  const daysSinceBackup = lastBackup ? Math.floor((Date.now() - lastBackup) / 86400000) : null;
  // Two shapes: one that stands as its own sentence, one that sits inside brackets mid-sentence.
  const backupAge =
    lastBackup === null ? 'never exported' :
    daysSinceBackup === 0 ? 'exported today' :
    daysSinceBackup === 1 ? 'exported yesterday' :
    `exported ${daysSinceBackup} days ago`;
  const backupAgeSentence = backupAge.charAt(0).toUpperCase() + backupAge.slice(1);

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    /**
     * Import is as destructive as reset — it replaces every show on the device. Same reasoning:
     * offer to save what's here first, in the same breath as the warning, rather than expecting
     * someone to have thought of it beforehand.
     */
    if (keptTotal > 0) {
      const save = window.confirm(
        `Importing replaces all ${keptTotal} ${keptTotal === 1 ? 'record' : 'records'} on this device.\n\n` +
        'OK to export a backup of them first, or Cancel to skip the backup.',
      );
      if (save) doExport();
    }
    if (!window.confirm('Replace everything on this device with the file you picked?')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = importBackup(String(reader.result || ''));
      setImportMsg(res.ok ? { ok: true, text: '✓ Backup restored.' } : { ok: false, text: res.error });
    };
    reader.onerror = () => setImportMsg({ ok: false, text: 'Couldn’t read that file.' });
    reader.readAsText(file);
  };

  return (
    <Sheet onClose={closeSettings} label="Settings">
        <div className="ct-sheet-title">Settings</div>

        {isAuthPreviewEnabled() && (
          <>
            <label className="ct-label-muted">ACCOUNT</label>
            <button onClick={openAuth} className="ct-btn-ghost" style={{ width: '100%', marginBottom: 6 }}>
              {session ? `Signed in as ${session.email}` : 'Sign up or sign in'}
            </button>
            <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.45, marginBottom: 22 }}>
              Preview of a future feature — no account is created yet.
            </div>
          </>
        )}

        <label className="ct-label-muted">APPEARANCE</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
          {(['Light', 'Dark'] as const).map((th) => (
            <button key={th} onClick={() => setTheme(th)} className={`ct-tab-btn${theme === th ? ' is-active' : ''}`}>{th}</button>
          ))}
        </div>

        <label className="ct-label-muted">CHARACTER EDITING</label>
        <button onClick={() => setAutoSave(!settings.autoSave)} style={{ width: '100%', height: 44, marginBottom: 22, border: '1px solid var(--input-border)', borderRadius: 12, background: settings.autoSave ? 'var(--accent)' : 'transparent', color: settings.autoSave ? '#fff' : 'var(--text-secondary)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s ease' }}>
          {settings.autoSave ? '✓ Auto-Save Enabled' : 'Auto-Save Disabled'}
        </button>

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px' }} />

        <label className="ct-label-muted">BACKUP</label>
        {/* Says the number and the age, because both were invisible. A library showing four hundred
            people might have twelve worth saving — the rest reload from TMDb — and a file that
            small looks broken unless you're told why it's small. */}
        <div style={{ fontSize: 13.5, color: 'var(--text-faint)', lineHeight: 1.5, marginBottom: 10 }}>
          Your data lives only on this device &mdash; no account, no server copy.{' '}
          {keptTotal === 0
            ? 'Nothing has been edited yet, so there is nothing a backup would need to carry: auto-loaded cast reloads by itself.'
            : `A backup carries the ${keptTotal} ${keptTotal === 1 ? 'record' : 'records'} you've edited or added by hand; auto-loaded cast is left out because it reloads by itself. ${backupAgeSentence}.`}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬇ Export</button>
          <button onClick={() => fileInputRef.current?.click()} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬆ Import</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: 'none' }} />
        </div>
        {importMsg && <div style={{ fontSize: 14, fontWeight: 700, color: importMsg.ok ? 'var(--accent-soft)' : '#C24B4B', marginBottom: 14 }}>{importMsg.text}</div>}

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        <button onClick={openFeedback} className="ct-btn-ghost" style={{ width: '100%', height: 44, marginBottom: 8 }}>💬 Send Feedback</button>

        {resetConfirm ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              This clears all shows, cast, shares and recents. There is no undo and no copy on a
              server &mdash; {keptTotal === 0
                ? 'nothing here has been edited, so a backup would be empty.'
                : `you have ${keptTotal} ${keptTotal === 1 ? 'record' : 'records'} a backup would carry (${backupAge}).`}
            </div>
            {keptTotal > 0 && (
              <button onClick={doExportThenReset} className="ct-btn-primary" style={{ width: '100%', height: 44, marginBottom: 8 }}>
                Export a backup, then reset
              </button>
            )}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={() => setResetConfirm(false)} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>Cancel</button>
              <button onClick={doReset} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid #C24B4B', background: 'transparent', color: '#C24B4B', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                {keptTotal > 0 ? 'Reset without a backup' : 'Reset'}
              </button>
            </div>
          </>
        ) : (
          <button onClick={() => setResetConfirm(true)} className="ct-btn-ghost" style={{ width: '100%', height: 44, color: '#C24B4B' }}>Reset to blank state</button>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 0', paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="tmdbGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#90cea1" /><stop offset="0.56" stopColor="#3cbec9" /><stop offset="1" stopColor="#00b3e5" /></linearGradient></defs><rect width="24" height="24" rx="5" fill="url(#tmdbGrad)" /></svg>
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-soft)', textDecoration: 'none' }}>The Movie Database</a>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5, textAlign: 'center' }}>
            Show &amp; cast data provided by TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
          </div>
          {/* TVmaze data is CC BY-SA, which requires visible credit and a link back. */}
          <div style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5, textAlign: 'center', marginTop: 8 }}>
            In-character images from{' '}
            <a href="https://www.tvmaze.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-soft)', fontWeight: 700, textDecoration: 'none' }}>TVmaze</a>
            , licensed under{' '}
            <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-soft)', fontWeight: 700, textDecoration: 'none' }}>CC BY-SA 4.0</a>.
          </div>
        </div>
    </Sheet>
  );
}
