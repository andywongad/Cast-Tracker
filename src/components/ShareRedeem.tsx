import { useEffect, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { bgStyle } from '../lib/utils';
import { encodeShare, MAX_LINK_CHARS } from '../lib/shareLink';
import Sheet from './Sheet';

/**
 * A link that carries what it shares.
 *
 * The previous version showed a six-character code and a QR pointing at `casttracker.app/s/<code>`
 * — a domain this app does not own, for a payload that lived in the sharer's own localStorage and
 * could be redeemed on no other device. Two screens promised "others can redeem"; nothing could.
 *
 * The payload now travels in the URL fragment, which is never sent to a server, so the notes
 * someone wrote go only to the person they sent them to. That also rules out a link preview, and
 * it should: the alternative is uploading a stranger's writing to make a thumbnail.
 */
export function ShareSheet() {
  const { shareSheet, closeShareSheet } = useUI();
  const [url, setUrl] = useState<string | null>(null);
  const [tooLong, setTooLong] = useState(false);
  const [copied, setCopied] = useState(false);

  const packet = shareSheet?.packet;
  useEffect(() => {
    if (!packet) { setUrl(null); return; }
    let alive = true;
    // Encoding compresses, so it is async. The sheet renders immediately and fills in — a spinner
    // for something that takes a few milliseconds would flash and be gone.
    void encodeShare(packet, `${window.location.origin}${window.location.pathname}`).then((res) => {
      if (!alive) return;
      setUrl(res.url);
      setTooLong(res.tooLong);
    });
    return () => { alive = false; };
  }, [packet]);

  if (!shareSheet) return null;

  const copy = () => {
    if (!url) return;
    try { void navigator.clipboard.writeText(url); } catch { /* a manual selection still works */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sendNative = () => {
    if (!url || typeof navigator.share !== 'function') return;
    void navigator.share({ title: shareSheet.title, url }).catch(() => { /* dismissed */ });
  };

  return (
    <Sheet onClose={closeShareSheet} label="Share" sheetStyle={{ maxHeight: 'none', padding: '22px 18px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, flex: 'none', backgroundColor: shareSheet.color || 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(shareSheet.photo) }}>
            {!shareSheet.photo && shareSheet.initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shareSheet.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{shareSheet.subtitle}</div>
          </div>
        </div>

        {tooLong ? (
          /* Refusing beats sending a link that messaging apps truncate: the recipient gets an
             error neither of you can explain, and the sharer believes it worked. */
          <div style={{ fontSize: 13, color: 'var(--danger)', lineHeight: 1.5, marginBottom: 8 }}>
            This show has too much written in it to fit in a link. Share a single character instead,
            or export a backup file from Settings and send that.
          </div>
        ) : (
          <>
            <div className="ct-label-muted">SHARE LINK</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 46, border: '1px solid var(--input-border)', borderRadius: 12, display: 'flex', alignItems: 'center', padding: '0 14px', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--surface)' }}>
                {url ? url.replace(/^https?:\/\//, '') : 'Preparing…'}
              </div>
              <button onClick={copy} disabled={!url} style={{ flex: 'none', height: 46, padding: '0 18px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: url ? 'pointer' : 'not-allowed', opacity: url ? 1 : 0.6 }}>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {/* Hands the link to the operating system's own share sheet — Messages, Mail, AirDrop.
                Worth its place on a phone, where it removes the fiddliest step; on a laptop most
                people will reach for Copy and paste into whatever they were already typing in.
                Named for what it sends, because "Send…" alone says neither what nor where. */}
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button onClick={sendNative} disabled={!url} className="ct-btn-ghost" style={{ width: '100%', height: 44, marginBottom: 12 }}>
                Send link&hellip;
              </button>
            )}
          </>
        )}

        <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.5 }}>
          Whoever opens this link gets their own copy to edit — yours is untouched, and the two
          don&rsquo;t stay in step afterwards. Only what you wrote travels; cast loaded from TMDb
          arrives on their device by itself.
        </div>
    </Sheet>
  );
}

/** Kept for the link limit's sake: the number in the copy above should match the one enforced. */
export const SHARE_LIMIT = MAX_LINK_CHARS;
