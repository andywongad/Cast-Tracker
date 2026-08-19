import { useEffect, useRef, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import { getSeasonEpisodes, type SeasonEpisode } from '../lib/tmdb';
import Sheet from './Sheet';

/**
 * After this many showings the tip retires itself.
 *
 * Three, because a hint that outlives its usefulness stops being a hint and becomes furniture.
 * Someone perfectly happy tapping the button should not be told about the shortcut forever.
 */
export const RECAP_TIP_LIMIT = 3;

/**
 * What happened in the episode *before* the one you're on.
 *
 * Deliberately the previous episode and not the current one. TMDb's overviews are synopses, not
 * teasers — "a major lead points to ADA Maroun", "the FBI begins an elaborate operation to bug
 * their home" — so putting the selected episode's text on screen would spoil the episode someone
 * is in the middle of watching, at the exact moment they opened the app to look something up. The
 * previous one needs no warning because you've already seen it, which is also why this costs no
 * space for a caveat.
 *
 * A sheet rather than an inline expander so the cast grid doesn't shift under the finger that was
 * already reaching for a card.
 */
export default function RecapSheet({
  episodesForSeason,
  currentSeason,
  showTmdbId,
}: {
  /** The loaded season, so the common case needs no request at all. */
  episodesForSeason: SeasonEpisode[];
  currentSeason: number;
  showTmdbId: number | null;
}) {
  const { recap, closeRecap } = useUI();
  const { settings, bumpRecapTip } = useStore();
  const [priorSeason, setPriorSeason] = useState<{ season: number; episodes: SeasonEpisode[] } | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Decided once per *opening*, and held for as long as that opening lasts.
   *
   * Not `useState(() => …)`: this component stays mounted for the life of the show screen and
   * merely renders null while closed, so a lazy initialiser would settle the question once at
   * mount and answer the same way forever — the tip outstayed its three showings and the counter
   * ran past the limit. Not read live from settings either, or the sentence would disappear out
   * from under the person reading it the instant the count below is written.
   */
  const [showTip, setShowTip] = useState(false);
  const seenRef = useRef(settings.recapTipShown);
  seenRef.current = settings.recapTipShown;

  // Counted when it is actually on screen rather than when the sheet mounts: on a series' first
  // episode no sheet ever opens, and a tip nobody saw shouldn't burn one of its three showings.
  useEffect(() => {
    if (!recap.open) return;
    const eligible = seenRef.current < RECAP_TIP_LIMIT;
    setShowTip(eligible);
    if (eligible) bumpRecapTip(seenRef.current + 1);
  }, [recap.open, bumpRecapTip]);

  const wantsPriorSeason = recap.open && recap.season !== currentSeason;

  /**
   * Episode 1's predecessor lives in the season before it, which isn't in the payload on hand.
   * Fetched only when the sheet is actually opened on that boundary — the ordinary case, where the
   * previous episode is in the season already loaded, costs nothing.
   */
  useEffect(() => {
    if (!wantsPriorSeason || !showTmdbId) return;
    if (priorSeason?.season === recap.season) return;
    let alive = true;
    setLoading(true);
    getSeasonEpisodes(showTmdbId, recap.season)
      .then((eps) => { if (alive) setPriorSeason({ season: recap.season, episodes: eps }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [wantsPriorSeason, showTmdbId, recap.season, priorSeason?.season]);

  if (!recap.open) return null;

  const crossesSeasons = recap.season !== currentSeason;
  const source = crossesSeasons ? priorSeason?.episodes ?? [] : episodesForSeason;
  /**
   * Episode 0 is the caller saying "whatever the last one of that season was" — a number it can't
   * know from the season it's showing. Resolved here, once the season is in hand.
   */
  const episode =
    recap.episode === 0 ? source[source.length - 1] ?? null : source.find((e) => e.number === recap.episode) ?? null;
  const number = episode?.number ?? recap.episode;

  return (
    <Sheet onClose={closeRecap} label={`Recap of season ${recap.season}, episode ${number}`}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
        Previously
      </div>
      <h2 className="ct-heading" style={{ fontSize: 20, margin: '0 0 14px', fontWeight: 500 }}>
        {/* Named in full when it's the last episode of the season before — that's the moment this
            is most useful, and "Ep 10" alone would read as an episode of the season you're on. */}
        {crossesSeasons ? `Season ${recap.season}, Episode ${number}` : `Episode ${number}`}
        {episode?.name ? ` · ${episode.name}` : ''}
      </h2>

      {loading && !episode ? (
        <div style={{ fontSize: 14, color: 'var(--text-faint)' }}>Loading&hellip;</div>
      ) : episode?.overview ? (
        <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>{episode.overview}</p>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-faint)', margin: 0 }}>
          TMDb doesn&rsquo;t have a summary for this episode.
        </p>
      )}

      <button onClick={closeRecap} className="ct-btn-ghost" style={{ width: '100%', marginTop: 22 }}>Done</button>

      {/* Taught here rather than on the show screen: this costs no pixels on the surface whose job
          is showing cast, and it only reaches people who have already used the feature and know
          what it gives them. A coach mark on the episode rail would have to sell the payoff *and*
          the gesture to someone who asked for neither. */}
      {showTip && (
        <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-faint)', textAlign: 'center', margin: '12px 0 0' }}>
          Tip: double-tap an episode to get here faster.
        </p>
      )}
    </Sheet>
  );
}
