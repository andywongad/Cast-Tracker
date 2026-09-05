import { useUI } from '../hooks/useUI';

export default function Footer() {
  const { screen, openTranslator, openConverter, openAddCast, openAddShow } = useUI();
  /**
   * One button, two jobs, and the icon says which.
   *
   * From the library this opens a TMDb search — you type a title and pick from results — so it
   * shows a magnifying glass and says so. A "+" described the outcome rather than the action, and
   * the first thing that actually happens is a search box.
   *
   * On a show screen the same button opens the add-cast form, which is manual entry plus autofill
   * from credits already loaded. That is not a search, so it keeps the "+". Using one icon for
   * both would just move the dishonesty rather than remove it.
   */
  const onShow = screen === 'show';
  const addLabel = onShow ? 'Add cast' : 'Search shows';
  const addAction = onShow ? () => openAddCast() : () => openAddShow();

  return (
    <nav className="ct-footer" aria-label="Main">
      <button className="ct-footer-btn" onClick={openTranslator}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 3h6M5 3v1.2c0 2.5-1.5 4.4-3.5 5.3M3.2 6.3c.6 1.3 2 2.4 3.3 2.7M8 14l3-7 3 7M9 11.5h4" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="ct-footer-label">Translate</span>
      </button>
      {/* Classes rather than inline style, so the desktop rail can restyle this. An inline style
          beats a stylesheet, and the disc — hoisted above the bar on a 54px circle — is a bottom-bar
          idea that has no meaning in a vertical rail. */}
      <button className="ct-footer-add" onClick={addAction}>
        <div className="ct-footer-add-disc">
          {/* Both are aria-hidden so the button's name comes from its visible label alone. The "+"
              used to be a text node, which meant screen readers announced "plus Add show". */}
          {onShow ? (
            <span aria-hidden="true" style={{ fontSize: 26, fontWeight: 300, color: 'var(--cta-text)', lineHeight: 1 }}>+</span>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6.5" stroke="var(--cta-text)" strokeWidth="2" />
              <path d="M15.5 15.5 20 20" stroke="var(--cta-text)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <span className="ct-footer-add-label">{addLabel}</span>
      </button>
      <button className="ct-footer-btn" onClick={() => openConverter()}>
        <svg width="19" height="19" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 5.5h9M2 5.5l2.5-2.5M2 5.5L4.5 8M14 10.5H5M14 10.5l-2.5-2.5M14 10.5L11.5 13" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="ct-footer-label">Convert</span>
      </button>
    </nav>
  );
}
