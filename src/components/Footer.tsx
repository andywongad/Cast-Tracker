import { useUI } from '../hooks/useUI';

export default function Footer() {
  const { screen, openTranslator, openConverter, openAddCast, openAddShow } = useUI();
  const addLabel = screen === 'show' ? 'Add cast' : 'Add show';
  const addAction = screen === 'show' ? () => openAddCast() : () => openAddShow();

  return (
    <div className="ct-footer">
      <button className="ct-footer-btn" onClick={openTranslator}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none"><path d="M2 3h6M5 3v1.2c0 2.5-1.5 4.4-3.5 5.3M3.2 6.3c.6 1.3 2 2.4 3.3 2.7M8 14l3-7 3 7M9 11.5h4" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="ct-footer-label">Translate</span>
      </button>
      <button style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }} onClick={addAction}>
        <div style={{ width: 50, height: 50, borderRadius: 999, background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: -24, boxShadow: '0 6px 16px rgba(99,102,241,0.45)', border: '4px solid var(--bg)' }}>
          <span style={{ fontSize: 26, fontWeight: 400, color: '#fff', lineHeight: 1 }}>+</span>
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', paddingBottom: 8 }}>{addLabel}</span>
      </button>
      <button className="ct-footer-btn" onClick={() => openConverter()}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none"><path d="M2 5.5h9M2 5.5l2.5-2.5M2 5.5L4.5 8M14 10.5H5M14 10.5l-2.5-2.5M14 10.5L11.5 13" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="ct-footer-label">Convert</span>
      </button>
    </div>
  );
}
