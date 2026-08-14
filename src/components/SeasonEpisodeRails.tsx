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
 * these cost about 100px more vertical space, and buy episode titles and the ability to scan.
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
}: {
  seasons: number[];
  currentSeason: number;
  onSeasonChange: (n: number) => void;
  episodes: SeasonEpisode[];
  currentEpisode: number;
  onEpisodeChange: (n: number) => void;
  episodesLoading: boolean;
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
                className={`ct-rail-item${selected ? ' ct-rail-item-selected' : ''}`}
                // Number always readable; the title takes whatever room is left. Titles run long
                // ("Denial, Anger, Acceptance") and a rail of full titles can't be scanned.
                style={{ gap: 7, maxWidth: 210 }}
              >
                <span style={{ flex: 'none' }}>Ep {ep.number}</span>
                {ep.name && (
                  <span
                    style={{
                      fontWeight: 500,
                      opacity: 0.75,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      minWidth: 0,
                    }}
                  >
                    {ep.name}
                  </span>
                )}
              </button>
            );
          })
        )}
      </Rail>
    </div>
  );
}
