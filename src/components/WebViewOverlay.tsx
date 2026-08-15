import { useEffect, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useDismissible } from './Sheet';

/**
 * Not a bottom sheet, so it has no backdrop to tap and doesn't use the Sheet component — but
 * Escape and the back gesture should still get you out of it, like everything else.
 *
 * Split in two so the body only mounts while open: useDismissible treats being mounted as being
 * open, which is what keeps the topmost-wins stack honest.
 */
export default function WebViewOverlay() {
  const { webView, closeWebView } = useUI();
  if (!webView.open) return null;
  return <WebViewBody url={webView.url} label={webView.label} onClose={closeWebView} />;
}

function WebViewBody({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  const [slow, setSlow] = useState(false);
  useDismissible(onClose);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 3500);
    return () => clearTimeout(t);
  }, [url]);

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button onClick={onClose} style={{ width: 34, height: 34, flex: 'none', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--sheet)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
        <a href={url} target="_blank" rel="noopener noreferrer" style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)', textDecoration: 'none', padding: '8px 12px', borderRadius: 999, border: '1px solid var(--border)' }}>
          Open externally
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M6 3h7v7M13 3L6.5 9.5M4 5v7h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>
      {slow && (
        <div style={{ flex: 'none', padding: '8px 14px', fontSize: 14, color: 'var(--text-faint)', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
          Taking a while, or blocked from loading here? Use &ldquo;Open externally&rdquo; above.
        </div>
      )}
      <iframe src={url} title={label} style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
    </div>
  );
}
