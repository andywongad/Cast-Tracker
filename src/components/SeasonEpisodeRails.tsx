import { useEffect, useRef } from 'react';
import { Skeleton, SkeletonBar } from './Skeleton';
import type { SeasonEpisode } from '../lib/tmdb';

/**
 * How close together two taps must be to count as a double-tap.
 *
 * Measured against each event's own `timeStamp`, which the browser sets when the tap happened,
 * not `Date.now()` inside the handler. The first tap starts real work — a clone of the show, a
 * localStorage write, a full grid re-render — and while that runs the second tap's handler simply
 * waits its turn. Timing from handler entry charged that delay to the user, so a genuinely quick
 * double-tap read as two slow single taps and the gesture silently did nothing. How long the app
 * took to respond is not evidence about how fast someone tapped.
 */
const DOUBLE_TAP_MS = 320;

/**
 * Season rail over episode rail, both horizontally scrollable.
 *
 * The selected chip in each rail is sticky on both edges, so it rides the left edge once you've
 * scrolled past it and the right edge while you're still short of it — you never lose track of
 * where you are in a 50-season run, in either direction. Items really do pass underneath, which is
 * why the selected chip carries an opaque fill and a ring (see .ct-rail-item-selected).
 *
 * Replaces two native selects. Those collapsed into one row and got iOS's wheel picker for free;
 * these cost about 100px more vertical space, and buy a selection that stays pinned in view.
 */
function Rail({
  children,
  listKey,
  label,
}: {
  children: React.ReactNode;
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

  /* There was an effect here that scrolled the selection into view when it changed from outside
     the rail, and a `selectedKey` prop to drive it. It only ran when the chip was out of view, and
     the chip is now clamped to whichever edge it would otherwise leave, so that condition can no
     longer be true. Both removed rather than left to never fire. */

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
  onEpisodeRecap,
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
   * Double-tapping an episode opens its recap. Strictly an accelerator — the labelled "Previously"
   * button on the section heading is the real route in, because a hidden gesture is no route at
   * all for a keyboard user, and on iOS VoiceOver double-tap already means "activate".
   */
  onEpisodeRecap?: (episode: number) => void;
  /**
   * Sits at the end of the episode row rather than on a line of its own. The import button used
   * to take a full row under the rails, and every pixel of header is a pixel of cast you can't
   * see — which is the whole point of this screen.
   */
  trailing?: React.ReactNode;
}) {
  /**
   * The first tap of a double-tap still selects, immediately — the second tap only adds the recap.
   * Waiting ~300ms to see whether a second tap is coming would make every episode change feel
   * sluggish to the overwhelming majority of taps that are single. Re-selecting the episode you
   * are already on is a no-op, so the doubled selection costs nothing.
   */
  const lastTap = useRef<{ episode: number; at: number }>({ episode: -1, at: 0 });
  const tapEpisode = (n: number, at: number) => {
    const isSecond = lastTap.current.episode === n && at - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = isSecond ? { episode: -1, at: 0 } : { episode: n, at };
    onEpisodeChange(n);
    if (isSecond) onEpisodeRecap?.(n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <Rail label="Season">
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
      <Rail listKey={currentSeason} label="Episode">
        {episodesLoading && episodes.length === 0 ? (
          /* Chips, not a sentence: the rail is a row of tappable pills and the placeholder should
             say so. minHeight matches a real chip so the rail doesn't change height on arrival. */
          <Skeleton label="Loading episodes" style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {Array.from({ length: 6 }, (_, i) => (
                <SkeletonBar key={i} width={i === 0 ? 62 : 54} height={32} radius={999} />
              ))}
            </div>
          </Skeleton>
        ) : (
          episodes.map((ep) => {
            const selected = ep.number === currentEpisode;
            return (
              <button
                key={ep.number}
                role="tab"
                aria-selected={selected}
                data-selected={selected}
                onClick={(e) => tapEpisode(ep.number, e.timeStamp)}
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
