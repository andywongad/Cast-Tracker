import { useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import { bgStyle } from '../lib/utils';

export function ShareSheet() {
  const { shareSheet, closeShareSheet } = useUI();
  const [copied, setCopied] = useState(false);
  if (!shareSheet) return null;

  const link = `casttracker.app/s/${shareSheet.code}`;
  const copy = () => {
    try { navigator.clipboard.writeText(`https://${link}`); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(`https://${link}`)}`;

  return (
    <div className="ct-scrim" onClick={closeShareSheet}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'none', padding: '22px 18px 28px' }}>
        <div className="ct-sheet-grabber" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, flex: 'none', backgroundColor: shareSheet.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(shareSheet.photo) }}>
            {!shareSheet.photo && shareSheet.initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareSheet.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{shareSheet.subtitle}</div>
          </div>
        </div>
        <div className="ct-label-muted">SHARE LINK</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 46, border: '1px solid var(--input-border)', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--surface)' }}>{link}</div>
          <button onClick={copy} style={{ flex: 'none', height: 46, padding: '0 18px', border: 'none', borderRadius: 12, background: 'var(--text)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <div style={{ width: 120, height: 120, borderRadius: 10, border: '1px solid var(--border)', backgroundSize: 'cover', backgroundImage: `url("${qrSrc}")` }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>Whoever opens this can add their own copy to their tracker &mdash; and edit it freely from there. (Sharing works within this browser today; cross-device delivery needs a backend.)</div>
      </div>
    </div>
  );
}

export function RedeemSheet() {
  const { redeem, closeRedeem, activeShowId, openShow } = useUI();
  const { claimRedeem } = useStore();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  if (!redeem.open) return null;

  const claim = () => {
    const res = claimRedeem(code, redeem.mode, activeShowId);
    if (!res.ok) { setError(res.error); return; }
    setCode(''); setError('');
    closeRedeem();
    if (res.newShowId) openShow(res.newShowId);
  };

  return (
    <div className="ct-scrim" onClick={closeRedeem}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()} style={{ maxHeight: 'none', padding: '22px 18px 28px' }}>
        <div className="ct-sheet-grabber" />
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{redeem.mode === 'show' ? 'Redeem a Show Card' : 'Redeem a Character Card'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>Enter the code someone shared with you.</div>
        <input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)); setError(''); }} placeholder="e.g. AB3XQ9" style={{ width: '100%', height: 50, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', padding: '0 14px', fontSize: 18, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, outline: 'none' }} />
        {error && <div style={{ fontSize: 12, color: '#E08A80', marginBottom: 12 }}>{error}</div>}
        <button onClick={claim} className="ct-btn-primary" style={{ width: '100%' }}>Add to My Tracker</button>
      </div>
    </div>
  );
}
