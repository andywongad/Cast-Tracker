import { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { bgStyle, initials, SHOW_TYPE_LABELS } from '../lib/utils';
import NotificationToggle from './NotificationToggle';
import { PUSH_CONFIGURED } from '../lib/notifications';
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
      <span style={{ fontSize: 15, color: danger ? 'var(--danger)' : 'var(--text)' }}>{label}</span>
      {hint && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  );
}

export default function ShowMenuSheet() {
  const { showById, shareShow, disposableCount, clearDisposable, updateData } = useStore();
  const { activeShowId, showMenuOpen, closeShowMenu, openWebView, openShareSheet, openRedeem } = useUI();
  const show = showById(activeShowId);

  const typeLabel = useMemo(() => {
    if (!show) return '';
    return SHOW_TYPE_LABELS[show.type];
  }, [show]);

  if (!showMenuOpen || !show) return null;

  const autoCount = disposableCount(show.id);

  const act = (fn: () => void) => () => { closeShowMenu(); fn(); };

  const done = show.status === 'completed';
  /**
   * The only way a show moves between the two home sections.
   *
   * Both directions run through one control, so Completed can't become a dead end — a show binged
   * in a weekend and then picked back up for a new season has to be able to come back, and a
   * mis-tap has to be undoable from the same place it happened.
   */
  const toggleStatus = () => {
    const id = show.id;
    updateData((d) => {
      const s = d.shows.find((x) => x.id === id);
      if (s) s.status = s.status === 'completed' ? 'watching' : 'completed';
    });
    closeShowMenu();
  };

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

        {/* The spacer is conditional too, or a hidden toggle leaves 18px of nothing above the
            first row. */}
        {PUSH_CONFIGURED && !!show.tmdbId && (
          <div style={{ marginBottom: 18 }}>
            <NotificationToggle showTmdbId={show.tmdbId} />
          </div>
        )}

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
          {/* First, because it is the only row here that changes what the app shows you rather
              than opening something. The hint names the destination: "completed" on its own
              doesn't tell you a section exists for it. */}
          <Row
            label={done ? 'Move back to Currently watching' : 'Mark as completed'}
            hint={done ? 'Returns this show to your in-progress list' : 'Moves it to Completed on the home screen'}
            onClick={toggleStatus}
          />
          <Row label="Share this show" hint="Generate a code others can redeem" onClick={act(() => openShareSheet(shareShow(show.id)))} />
          <Row label="Redeem a character code" onClick={act(() => openRedeem('cast'))} />
          {show.wikiUrl && <Row label="Wikipedia" onClick={act(() => openWebView(show.wikiUrl, 'Wikipedia'))} />}
          {show.imdbUrl && <Row label="IMDb" onClick={act(() => openWebView(show.imdbUrl, 'IMDb'))} />}
        </div>

        <button onClick={closeShowMenu} className="ct-btn-ghost" style={{ width: '100%', marginTop: 22 }}>Done</button>
    </Sheet>
  );
}
