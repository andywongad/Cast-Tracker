import { useEffect, useRef } from 'react';
import type { SeasonEpisode } from '../lib/tmdb';

/**
 * Season rail over episode rail, both horizontally scrollable.
 *
 * The selected chip in each rail is `position: sticky; left: 0`, so it stays pinned at the left
 * edge while the rest of the rail scrolls behind it — you never lose track of where you are in a
 * 50-season run. Items really do pass underneath, which is why the selected chip carries an opaque
 * fill and a ring (see .ct-rail-item-selected).
 *
 * Replaces two native selects. Those collapsed into one row and got iOS's wheel picker for free;
 * these cost about 100px more vertical space, and buy a selection that stays pinned in view.
 */
function Rail({
  children,
  selectedKey,
  listKey,
  label,
}: {
  children: React.ReactNode;
  selectedKey: string | number;
  /** Changes when the rail's contents are replaced wholesale, which resets the scroll to the start. */
  listKey?: string | number;
  label: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);

  /**
   * A new list starts at the beginning. Without this the episode rail keeps the scroll offset from
   * the previous season, and because the selected chip is sticky it *looks* like you're at Ep 1
   * while Ep 2-10 sit hidden behind it — the rail reads "Ep 1, Ep 11, Ep 12".
   */
  useEffect(() => {
    if (listKey !== undefined && railRef.current) railRef.current.scrollLeft = 0;
  }, [listKey]);

  /**
   * Bring the selection into view when it changes from outside the rail.
   *
   * Skipped when the selected chip is already pinned at the left edge: it's sticky, so it reads as
   * in view even when the rail is scrolled well past it, and scrolling to it would yank the rail
   * back under the user for no visible gain.
   */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const chip = rail.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (!chip) return;
    const railBox = rail.getBoundingClientRect();
    const chipBox = chip.getBoundingClientRect();
    const visible = chipBox.left >= railBox.left - 1 && chipBox.right <= railBox.right + 1;
    if (!visible) chip.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedKey]);

  return (
    <div className="ct-hscroll">
      <div ref={railRef} className="ct-rail" role="tablist" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

export default function SeasonEpisodeRails({
  seasons,
  currentSeason,
  onSeasonChange,
  episodes,
  currentEpisode,
  onEpisodeChange,
  episodesLoading,
  trailing,
}: {
  seasons: number[];
  currentSeason: number;
  onSeasonChange: (n: number) => void;
  episodes: SeasonEpisode[];
  currentEpisode: number;
  onEpisodeChange: (n: number) => void;
  episodesLoading: boolean;
  /**
   * Sits at the end of the episode row rather than on a line of its own. The import button used
   * to take a full row under the rails, and every pixel of header is a pixel of cast you can't
   * see — which is the whole point of this screen.
   */
  trailing?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Rail selectedKey={currentSeason} label="Season">
        {seasons.map((n) => {
          const selected = n === currentSeason;
          return (
            <button
              key={n}
              role="tab"
              aria-selected={selected}
              data-selected={selected}
              onClick={() => onSeasonChange(n)}
              className={`ct-rail-item${selected ? ' ct-rail-item-selected' : ''}`}
            >
              Season {n}
            </button>
          );
        })}
      </Rail>

      {/* The episode rail takes the room the trailing control doesn't. minWidth: 0 is what lets it
          actually shrink — a flex item defaults to its content width, so without it the rail would
          push the button off the edge instead of scrolling. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
      <Rail selectedKey={`${currentSeason}:${currentEpisode}`} listKey={currentSeason} label="Episode">
        {episodesLoading && episodes.length === 0 ? (
          <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 13, color: 'var(--text-faint)' }}>
            Loading episodes&hellip;
          </div>
        ) : (
          episodes.map((ep) => {
            const selected = ep.number === currentEpisode;
            return (
              <button
                key={ep.number}
                role="tab"
                aria-selected={selected}
                data-selected={selected}
                onClick={() => onEpisodeChange(ep.number)}
                className={`ct-rail-item ct-rail-item-sm${selected ? ' ct-rail-item-selected' : ''}`}
                // Number only. Titles were tried and taken back out: they made every chip a
                // different width, which is hard to scan and cost most of the rail's visible
                // range. The title still comes back with the season payload and is shown on the
                // guest tier's heading, where there's room for it.
                title={ep.name || undefined}
              >
                Ep {ep.number}
              </button>
            );
          })
        )}
      </Rail>
        </div>
        {trailing}
      </div>
    </div>
  );
}
