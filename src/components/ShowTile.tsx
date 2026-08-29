import type { Show } from '../types';
import { initials, bgStyle } from '../lib/utils';
import { hasUserContent } from '../lib/castValue';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import CardActions from './CardActions';

export function ShowTile({ show, columns, done = false }: { show: Show; columns: number; done?: boolean }) {
  const { openShow, openEditShow, openShareSheet, openNoted } = useUI();
  const { shareShow } = useStore();
  /**
   * How many of these people carry something the user wrote.
   *
   * Not `show.cast.length`, which counted TMDb passing through: selecting an episode writes
   * everyone credited on it into the show, so the old badge measured how many episodes had been
   * opened rather than anything the user decided. On this library that read 176 for one show and
   * 23 for another, which said nothing about either. The header of lib/castValue.ts has the
   * numbers — 4 of 357 records held anything typed — and `hasUserContent` is the same predicate
   * "Clear auto-loaded characters" already trusts.
   *
   * Read here, never written: that function is load-bearing for sync, and this is one more
   * caller of it.
   */
  const noted = show.cast.reduce((n, c) => (hasUserContent(c) ? n + 1 : n), 0);
  /**
   * The word is dropped at the densest setting, the same place the type badge used to switch to
   * its two-letter form. A four-column tile is not wide enough for a badge and a word: on a
   * completed show "DONE" and "2 noted" ran past the edge of the poster together. The meaning is
   * still carried in full by the accessible name, which is not width-constrained.
   */
  const notedLabel = columns >= 4 ? String(noted) : `${noted} noted`;
  const caughtUpVisible = !!show.caughtUpEp && (columns === 2 || columns === 3);

  return (
    /* A button, not a div with a click handler. It was unreachable by keyboard and announced as
       nothing — the largest, most obvious target on the home screen, invisible to anyone not using
       a mouse. Its name is now just the title and its state: the badges that used to be read out
       as part of it have moved outside, and the noted one announces itself. */
    <div style={{ position: 'relative' }}>
    <button
      type="button"
      onClick={() => openShow(show.id)}
      aria-label={`${show.title}${done ? ', completed' : ''}`}
      style={{ position: 'relative', display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', color: 'var(--text)', background: 'none', border: 'none', padding: 0, borderRadius: 18 }}
    >
      {/* 4:5, not square and not the poster's own 2:3.

          TMDb posters are 2:3, so a square crop threw away a third of the height — and a poster
          prints its title in the part that went, which is why the grid read SINGLE'S rather than
          SINGLE'S INFERNO. Nothing was actually lost, because the title is written underneath as
          text, but a wall of decapitated artwork reads as broken.

          Full portrait would crop nothing and cost half a row of height again on every row, on the
          one screen whose job is picking a show quickly. 4:5 gives back half the crop for a
          quarter of the height, and keeps enough squareness that this still reads as a grid. */}
      <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 18, overflow: 'hidden', backgroundColor: show.color, opacity: done ? 0.75 : 1, ...bgStyle(show.poster) }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, rgba(255,255,255,0.14), rgba(0,0,0,0.32))' }} />
        {!show.poster && <span style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 60, fontWeight: 800, color: 'rgba(255,255,255,0.16)', lineHeight: 0.7 }}>{initials(show.title)}</span>}
        {/* Dropped to where the count used to sit, now that it has vacated. */}
        {caughtUpVisible && (
          <span style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--text-muted)', padding: '3px 7px', borderRadius: 999 }}>Caught up &middot; {show.caughtUpEp}</span>
        )}
      </div>
      <div style={{ marginTop: 9, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{show.title}</div>
    </button>
    {/* Outside the button: a button inside a button is invalid, and nesting them made these two
        unreachable by keyboard as well. The badges below are here for the same reason — the noted
        one is now a control in its own right, and it sits over the poster, so it has to be a
        sibling of the tile rather than a child of it.

        Top-left, and only what is worth covering artwork for. The count used to sit bottom-left,
        which is where a poster prints its own title — it was over REACHER, over SINGLE'S INFERNO.
        The type badge that used to be here said SCRIPTED or REALITY, which is taxonomy the owner
        of the library already knows: it drives real behaviour on the show screen, but nothing on
        this one filters or sorts by it, and ShowMenuSheet already names it where it can also be
        changed. So the corner carries state instead of category, and a show with nothing written
        in it carries nothing at all. */}
    <div style={{ position: 'absolute', top: 10, left: 10, maxWidth: 'calc(100% - 74px)', display: 'flex', alignItems: 'center', gap: 6, zIndex: 2 }}>
      {done && (
        <span style={{ flex: 'none', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.92)', background: 'rgba(0,0,0,0.28)', padding: '4px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>DONE</span>
      )}
      {noted > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openNoted(show.id); }}
          aria-label={`${noted} ${noted === 1 ? 'character' : 'characters'} with your notes in ${show.title}`}
          style={{ flex: 'none', font: 'inherit', fontSize: 12.5, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 8px', borderRadius: 999, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', whiteSpace: 'nowrap', border: 'none', cursor: 'pointer' }}
        >
          {notedLabel}
        </button>
      )}
    </div>
    <CardActions onEdit={() => openEditShow(show.id)} onShare={() => openShareSheet(shareShow(show.id))} />
    </div>
  );
}

export function RecentShowTile({ show }: { show: Show }) {
  const { openShow } = useUI();
  return (
    <button
      type="button"
      onClick={() => openShow(show.id)}
      aria-label={`${show.title}, recently viewed`}
      style={{ flex: 'none', width: 84, textAlign: 'left', cursor: 'pointer', color: 'var(--text)', background: 'none', border: 'none', padding: 0 }}
    >
      <div style={{ position: 'relative', width: 84, height: 84, borderRadius: 16, overflow: 'hidden', backgroundColor: show.color, display: 'flex', alignItems: 'center', justifyContent: 'center', ...bgStyle(show.poster) }}>
        {!show.poster && <span style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.85)' }}>{initials(show.title)}</span>}
      </div>
      {/* Two lines rather than one with an ellipsis. At 84px wide almost nothing fits on one:
          this row read "Single's In…", "Breaking B…", "My Royal …" — three shows identified by
          their first ten characters, in the strip whose whole purpose is getting back to one of
          them quickly. Two lines cost one line of height, once, on a single row. Still clamped,
          because a long title would otherwise push this strip taller than the tiles in it. */}
      <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{show.title}</div>
    </button>
  );
}
