import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';

export default function TopBar() {
  const { showById } = useStore();
  const { screen, activeShowId, goHome, openSettings } = useUI();
  const show = showById(activeShowId);
  const showBack = screen === 'show';

  return (
    <div className="ct-topbar">
      {showBack && (
        <button className="ct-iconbtn" onClick={goHome} aria-label="Back">
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="M12.5 4.5L6 10l6.5 5.5" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {!showBack && <div className="ct-heading" style={{ fontSize: 24 }}>Cast Tracker</div>}
        {showBack && (
          <div className="ct-heading" style={{ fontSize: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {show?.title || ''}
          </div>
        )}
      </div>
      <button className="ct-iconbtn bordered" onClick={openSettings} aria-label="Settings">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="var(--text-secondary)" strokeWidth="1.6" />
          <path d="M19.4 13a7.4 7.4 0 000-2l2-1.5-2-3.5-2.4 1a7.6 7.6 0 00-1.7-1L15 3h-4l-.3 2.5a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.5L6.6 11a7.4 7.4 0 000 2l-2 1.5 2 3.5 2.4-1a7.6 7.6 0 001.7 1L11 21h4l.3-2.5a7.6 7.6 0 001.7-1l2.4 1 2-3.5-2-1.5z" stroke="var(--text-secondary)" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
