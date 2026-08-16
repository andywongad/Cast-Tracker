import { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { bgStyle, initials, SHOW_TYPE_LABELS } from '../lib/utils';
import NotificationToggle from './NotificationToggle';
import Sheet from './Sheet';

/**
 * Per-show actions, moved off the show page into an overflow menu.
 *
 * These previously sat in a 150px block above the cast grid — poster, three link pills, the
 * notification toggle, the caught-up dropdown and a redeem link — which cost roughly a quarter of
 * the viewport before a single character was visible. All of it is occasional; the cast is not.
 */
function Row({ label, hint, onClick, danger }: { label: string; hint?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%',
        border: 'none', background: 'none', padding: '13px 2px', cursor: 'pointer', textAlign: 'left',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 15, color: danger ? '#C24B4B' : 'var(--text)' }}>{label}</span>
      {hint && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  );
}

export default function ShowMenuSheet() {
  const { showById, shareShow, disposableCount, clearDisposable } = useStore();
  const { activeShowId, showMenuOpen, closeShowMenu, openWebView, openShareSheet, openRedeem } = useUI();
  const show = showById(activeShowId);

  const typeLabel = useMemo(() => {
    if (!show) return '';
    return SHOW_TYPE_LABELS[show.type];
  }, [show]);

  if (!showMenuOpen || !show) return null;

  const autoCount = disposableCount(show.id);

  const act = (fn: () => void) => () => { closeShowMenu(); fn(); };

  return (
    <Sheet onClose={closeShowMenu} label="Show options">

        {/* The poster lived on the show page purely for identity; it belongs here now that the
            title carries that job in the top bar. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 54, height: 54, borderRadius: 14, flex: 'none', backgroundColor: show.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(show.poster) }}>
            {!show.poster && initials(show.title)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="ct-heading" style={{ fontSize: 19, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{show.title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{typeLabel} &middot; {show.cast.length} cast</div>
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <NotificationToggle showId={show.id} />
        </div>

        <div>
          {/* The undo for episode auto-loading. Only offered when there is something to clear,
              and it says how many so the number isn't a surprise. Records you've edited are not
              counted and not touched; the rest come straight back when you reopen the episode. */}
          {autoCount > 0 && (
            <Row
              label={`Clear ${autoCount} auto-loaded ${autoCount === 1 ? 'character' : 'characters'}`}
              hint="Anything you've edited is kept. The rest reload when you open the episode again."
              onClick={() => { clearDisposable(show.id); closeShowMenu(); }}
            />
          )}
          <Row label="Share this show" hint="Generate a code others can redeem" onClick={act(() => openShareSheet(shareShow(show.id)))} />
          <Row label="Redeem a character code" onClick={act(() => openRedeem('cast'))} />
          {show.wikiUrl && <Row label="Wikipedia" onClick={act(() => openWebView(show.wikiUrl, 'Wikipedia'))} />}
          {show.imdbUrl && <Row label="IMDb" onClick={act(() => openWebView(show.imdbUrl, 'IMDb'))} />}
        </div>

        <button onClick={closeShowMenu} className="ct-btn-ghost" style={{ width: '100%', marginTop: 22 }}>Done</button>
    </Sheet>
  );
}
