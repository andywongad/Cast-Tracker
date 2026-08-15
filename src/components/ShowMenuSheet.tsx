import { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import type { ShowType } from '../types';
import { useUI } from '../hooks/useUI';
import { bgStyle, initials, SHOW_TYPE_LABELS } from '../lib/utils';
import NotificationToggle from './NotificationToggle';

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
  const { showById, shareShow, updateData } = useStore();
  const { activeShowId, showMenuOpen, closeShowMenu, openWebView, openShareSheet, openRedeem } = useUI();
  const show = showById(activeShowId);

  const typeLabel = useMemo(() => {
    if (!show) return '';
    return SHOW_TYPE_LABELS[show.type];
  }, [show]);

  if (!showMenuOpen || !show) return null;

  const act = (fn: () => void) => () => { closeShowMenu(); fn(); };

  return (
    <div className="ct-scrim" onClick={closeShowMenu}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />

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

        {/* The correction path for a wrong inference. Not offered at add time — the type comes
            from TMDb's genre ids there — but reachable here, which is where you'd be when you
            notice the app calling contestants "characters" or the relationship map missing. */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>This show has</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['DRAMA', 'REALITY'] as ShowType[]).map((t) => {
              const active = show.type === t || (t === 'REALITY' && show.type === 'VARIETY');
              return (
                <button
                  key={t}
                  onClick={() => updateData((d) => { const s2 = d.shows.find((x) => x.id === show.id); if (s2) s2.type = t; })}
                  className={`ct-tab-btn${active ? ' is-active' : ''}`}
                >
                  {t === 'DRAMA' ? 'Characters' : 'A changing cast'}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <Row label="Share this show" hint="Generate a code others can redeem" onClick={act(() => openShareSheet(shareShow(show.id)))} />
          <Row label="Redeem a character code" onClick={act(() => openRedeem('cast'))} />
          {show.wikiUrl && <Row label="Wikipedia" onClick={act(() => openWebView(show.wikiUrl, 'Wikipedia'))} />}
          {show.imdbUrl && <Row label="IMDb" onClick={act(() => openWebView(show.imdbUrl, 'IMDb'))} />}
        </div>

        <button onClick={closeShowMenu} className="ct-btn-ghost" style={{ width: '100%', marginTop: 22 }}>Done</button>
      </div>
    </div>
  );
}
