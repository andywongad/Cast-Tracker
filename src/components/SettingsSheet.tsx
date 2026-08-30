import { useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { isAuthPreviewEnabled } from '../lib/auth';
import { isSyncConfigured } from '../lib/supabase';
import { useSync } from '../hooks/useSync';
import Sheet from './Sheet';

export default function SettingsSheet() {
  const { settings, setTheme, setAutoSave, exportBackup, importBackup, resetAll, clearEverywhere, backupState, keptTotal } = useStore();
  const { session, signOut } = useAuth();
  const sync = useSync();
  const { settingsOpen, closeSettings, resetToHome, openFeedback, openAuth, openPrivacy } = useUI();
  const [resetConfirm, setResetConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!settingsOpen) return null;
  const theme = settings.theme ?? 'Light';

  // Closing the sheet and going home are two layers, and a reset destroys everything the entries
  // behind them refer to. One step straight to the root rather than two traversals through
  // history that would each land on a show that no longer exists.
  const doReset = () => { resetAll(); setResetConfirm(false); resetToHome(); };

  /**
   * Sign out first, then clear. Order is the whole point: clearing while still signed in leaves the
   * sync engine running, and its next pull restores everything within seconds — which is exactly
   * what made the old single control feel broken.
   */
  const doSignOutAndClear = async () => {
    await signOut();
    doReset();
  };

  /**
   * Delete, then push, then clear the local remnants.
   *
   * The push matters: `clearEverywhere` only writes tombstones, and a device closed before the next
   * sync would leave the other devices holding a library its owner asked to be rid of. `syncNow`
   * sends them now. If it fails — offline, most likely — the tombstones stay queued in their own
   * key, which `resetAll` does not clear, and go out whenever the app next reaches the server.
   */
  const doDeleteEverywhere = async () => {
    setWiping(true);
    try {
      clearEverywhere();
      await sync.syncNow();
    } finally {
      setWiping(false);
      doReset();
    }
  };

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
  const doExportThenReset = () => {
    doExport();
    // Signed in, clearing without signing out is not a reset: the engine is still running and its
    // next pull puts the library straight back. The safe path has to be the one that actually ends
    // in a blank device, or the reassuring button is the one that does nothing.
    if (session) void doSignOutAndClear();
    else doReset();
  };

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

        {(isSyncConfigured() || isAuthPreviewEnabled()) && (
          <>
            <label className="ct-label-muted">ACCOUNT</label>
            {/* Two shapes, because the two states are different jobs. Signed out this is an offer
                and gets the weight of one; signed in it is a status readout that happens to be
                tappable, and a full-strength button would keep asking for attention it no longer
                needs. Both were the same grey block as Export, Import and Feedback. */}
            {session ? (
              <>
              <button
                onClick={openAuth}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  padding: '12px 14px', marginBottom: 6, border: 'none', borderRadius: 14,
                  background: 'var(--surface)', cursor: 'pointer',
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 14.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.email}
                  </div>
                  {/* Says what sync has actually done. A failure has to be visible: the point of an
                      account is that the work is somewhere else, and an error nobody sees is
                      indistinguishable from success. */}
                  <div style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.4, color: sync.state === 'error' ? 'var(--danger)' : 'var(--text-muted)' }}>
                    {sync.state === 'syncing' && 'Syncing\u2026'}
                    {sync.state === 'error' && (sync.error || 'Sync failed. It will try again shortly.')}
                    {sync.state === 'idle' && (sync.lastSyncedAt ? 'Everything is saved to your account.' : 'Waiting to sync.')}
                    {sync.state === 'off' && 'Signed in.'}
                  </div>
                </div>
                <span aria-hidden="true" style={{ flex: 'none', color: 'var(--icon-muted)', fontSize: 18, lineHeight: 1 }}>&rsaquo;</span>
              </button>
              {/* The way back when a device has stopped receiving.

                  A pull only ever asks for what is newer than the last row this device saw, which
                  is right until something is missed — after that the mark has stepped past it and
                  no refresh, reinstall or sign-out will ask for it again. This forgets the mark and
                  pulls the whole account. It cannot lose anything: the merge is the same per-record
                  last-write-wins as every other pull, so it costs one larger request and nothing
                  else. */}
              <button
                onClick={() => { void sync.resync(); }}
                disabled={sync.state === 'syncing'}
                style={{
                  border: 'none', background: 'none', padding: '0 2px', marginBottom: 22,
                  cursor: sync.state === 'syncing' ? 'default' : 'pointer', textAlign: 'left',
                  fontSize: 13, fontWeight: 700,
                  color: sync.state === 'syncing' ? 'var(--text-faint)' : 'var(--accent-soft)',
                }}
              >
                {sync.state === 'syncing' ? 'Syncing\u2026' : 'Missing something? Sync everything again'}
              </button>
              </>
            ) : (
              <>
                <button onClick={openAuth} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', height: 46, marginBottom: 6 }}>
                  Sign in to sync
                </button>
                <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.45, marginBottom: 22 }}>
                  {isSyncConfigured()
                    ? 'Optional. Your library keeps working on this device either way.'
                    : 'Preview of a future feature — no account is created yet.'}
                </div>
              </>
            )}
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
          {session
            ? 'Synced to your account, and exportable as a file.'
            : 'Your data lives only on this device \u2014 no account, no server copy.'}{' '}
          {keptTotal === 0
            ? 'Nothing has been edited yet, so there is nothing a backup would need to carry: auto-loaded cast reloads by itself.'
            : `A backup carries the ${keptTotal} ${keptTotal === 1 ? 'record' : 'records'} you've edited or added by hand; auto-loaded cast is left out because it reloads by itself. ${backupAgeSentence}.`}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={doExport} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬇ Export</button>
          <button onClick={() => fileInputRef.current?.click()} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>⬆ Import</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={onImportFile} style={{ display: 'none' }} />
        </div>
        {importMsg && <div style={{ fontSize: 14, fontWeight: 700, color: importMsg.ok ? 'var(--accent-soft)' : 'var(--danger)', marginBottom: 14 }}>{importMsg.text}</div>}

        <div style={{ borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        {/* Deliberately lighter than Export/Import. It is useful but it is not one of the actions
            that moves your data, and at equal weight it read as though it were. */}
        <button onClick={openFeedback} className="ct-btn-ghost" style={{ width: '100%', height: 40, marginBottom: 8, fontSize: 14, color: 'var(--text-muted)' }}>💬 Send Feedback</button>

        {resetConfirm ? (
          <>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>
              {/* The old copy said "no undo and no copy on a server". True before sync existed, and
                  a lie the moment someone signs in — at which point there is a copy on a server,
                  and it is what refills the device seconds after a reset. */}
              This clears all shows, cast, shares and recents from this device.{' '}
              {keptTotal === 0
                ? 'Nothing here has been edited, so a backup would be empty.'
                : `You have ${keptTotal} ${keptTotal === 1 ? 'record' : 'records'} a backup would carry (${backupAge}).`}
            </div>
            {keptTotal > 0 && (
              <button onClick={doExportThenReset} className="ct-btn-primary" style={{ width: '100%', height: 44, marginBottom: 8 }}>
                Export a backup, then {session ? 'clear this device' : 'reset'}
              </button>
            )}

            {/**
              * Signed in, "reset" is two different acts and the app used to offer only one of them.
              * Clearing the device leaves the account intact — sign back in and everything returns.
              * Deleting everywhere is the only thing here that destroys data, and it says so.
              * Signed out there is no distinction to draw, so the single control comes back.
              */}
            {session ? (
              <>
                <button
                  onClick={doSignOutAndClear}
                  className="ct-btn-ghost"
                  style={{ width: '100%', height: 44, marginBottom: 8 }}
                >
                  Sign out and clear this device
                </button>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.45, marginBottom: 12 }}>
                  Your library stays in your account. Signing back in brings it all back — on this
                  device or any other.
                </div>

                <button
                  onClick={doDeleteEverywhere}
                  disabled={wiping}
                  style={{ width: '100%', height: 44, marginBottom: 8, borderRadius: 12, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700, cursor: wiping ? 'not-allowed' : 'pointer', opacity: wiping ? 0.7 : 1 }}
                >
                  {wiping ? 'Deleting…' : 'Delete my library everywhere'}
                </button>
                <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.45, marginBottom: 12 }}>
                  Removes {keptTotal === 1 ? 'your 1 record' : `all ${keptTotal} of your records`} from
                  every device and from the server. Your account stays; the data does not. There is no undo.
                </div>

                <button onClick={() => setResetConfirm(false)} className="ct-btn-ghost" style={{ width: '100%', height: 44, marginBottom: 8 }}>Cancel</button>
              </>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button onClick={() => setResetConfirm(false)} className="ct-btn-ghost" style={{ flex: 1, height: 44 }}>Cancel</button>
                <button onClick={doReset} style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                  {keptTotal > 0 ? 'Reset without a backup' : 'Reset'}
                </button>
              </div>
            )}
          </>
        ) : (
          /* No longer a filled block the same size as Export. A destructive action should be
             findable and unmistakable, not prominent — weight here is an invitation to press it. */
          <button
            onClick={() => setResetConfirm(true)}
            style={{
              display: 'block', margin: '18px auto 0', padding: '8px 12px', minHeight: 32,
              border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13.5, color: 'var(--danger)',
            }}
          >
            Reset to blank state
          </button>
        )}

        {/* Below the destructive controls and above the attribution: it is reference material, not
            something anyone came here to do — but it has to be findable now that the app keeps
            addresses on a server. */}
        <button
          onClick={openPrivacy}
          style={{ display: 'block', margin: '18px auto 0', padding: '8px 12px', minHeight: 32, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}
        >
          What this app stores
        </button>

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
