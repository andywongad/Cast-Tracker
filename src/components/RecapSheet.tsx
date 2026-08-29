import { useEffect, useState } from 'react';
import { useUI } from '../hooks/useUI';
import { getSeason, type Season } from '../lib/tmdb';
import { fetchRecap, type RecapState } from '../lib/recap/client';
import Sheet from './Sheet';
import { SkeletonText } from './Skeleton';

/**
 * Below this an "overview" is a teaser, not a recap.
 *
 * The Bear is the case that set it: its episode overviews run a median of 19 characters in season
 * four — "Opportunity.", "Gears start to turn." — against 254 on The Sopranos and 186 on Law &
 * Order. That text is faithful to what the show published and useless for remembering what
 * happened, so the season summary is shown underneath it rather than leaving someone who tapped
 * "Previously" holding two words.
 */
const TOO_THIN = 60;

/**
 * What happened before the episode you're on.
 *
 * Deliberately not the selected episode. TMDb's overviews are synopses, not teasers — "a major
 * lead points to ADA Maroun" — so putting the current episode's text on screen would spoil the
 * episode someone is in the middle of watching, at the exact moment they opened the app to look
 * something up. What came before needs no warning because you've already seen it, which is also
 * why this costs no space for a caveat.
 *
 * A sheet rather than an inline expander so the cast grid doesn't shift under the finger that was
 * already reaching for a card.
 */
export default function RecapSheet({
  currentSeasonData,
  currentSeason,
  showTmdbId,
  showTitle,
}: {
  /** The loaded season, so the common case needs no request at all. */
  currentSeasonData: Season;
  currentSeason: number;
  showTmdbId: number | null;
  /** Sent to the recap endpoint, which names the show to the model. */
  showTitle: string;
}) {
  const { recap, closeRecap } = useUI();
  const [prior, setPrior] = useState<{ season: number; data: Season } | null>(null);
  const [loading, setLoading] = useState(false);
  const [written, setWritten] = useState<RecapState>({ status: 'idle' });

  const wantsPrior = recap.open && recap.season !== currentSeason;

  /**
   * Episode 1's predecessor lives in the season before it, which isn't in the payload on hand.
   * Fetched only when the sheet is actually opened on that boundary — the ordinary case, where the
   * previous episode is in the season already loaded, costs nothing.
   */
  useEffect(() => {
    if (!wantsPrior || !showTmdbId) return;
    if (prior?.season === recap.season) return;
    let alive = true;
    setLoading(true);
    getSeason(showTmdbId, recap.season)
      .then((data) => { if (alive) setPrior({ season: recap.season, data }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [wantsPrior, showTmdbId, recap.season, prior?.season]);

  const crossesSeasons = recap.season !== currentSeason;
  const season = crossesSeasons ? prior?.data : currentSeasonData;
  const episodes = season?.episodes ?? [];
  /**
   * Episode 0 is the caller saying "whatever the last one of that season was" — a number it can't
   * know from the season it's showing. Resolved here, once the season is in hand.
   */
  const episode =
    recap.episode === 0 ? episodes[episodes.length - 1] ?? null : episodes.find((e) => e.number === recap.episode) ?? null;
  const number = episode?.number ?? recap.episode;
  const seasonText = season?.overview ?? '';
  const episodeText = episode?.overview ?? '';

  /**
   * The written recap, for the season up to and including the episode this sheet is about.
   *
   * Asked for only once the season is in hand, because the episode number has to be resolved
   * before the request: episode 0 means "the last one", and sending that would cache the same
   * paragraph a second time under a second key. See api/_lib/recap-key.ts.
   *
   * Nothing here blocks the sheet. TMDb's own text renders immediately and stays on screen until
   * something better arrives, so the slowest this feature can make the app is "the same as it was
   * before it existed".
   */
  useEffect(() => {
    if (!recap.open) { setWritten({ status: 'idle' }); return; }
    if (!showTmdbId || !season || number < 1) return;
    let alive = true;
    setWritten({ status: 'loading' });
    fetchRecap({ showTmdbId, showTitle, season: recap.season, throughEpisode: number })
      .then((state) => { if (alive) setWritten(state); });
    return () => { alive = false; };
  }, [recap.open, recap.season, showTmdbId, showTitle, season, number]);

  if (!recap.open) return null;

  const composed = written.status === 'ready' ? written.data : null;

  /**
   * Crossing a season boundary, the season is the answer.
   *
   * This used to lead with the last episode of the previous season, which is the literal reading of
   * "previously" and not what anyone wants at the start of a new season — after a year away you
   * need the shape of the season you just finished, not its final forty minutes. The episode is
   * still shown, underneath, because it is the part that leads directly into what you're about to
   * watch. When TMDb has no season overview (The Bear's first season, for one) the episode carries
   * it alone, exactly as before.
   */
  const leadWithSeason = crossesSeasons && !!seasonText;
  // Mid-season, the season blurb is a backstop for shows whose per-episode text says nothing.
  const seasonAsBackup = !crossesSeasons && !!seasonText && episodeText.length < TOO_THIN;

  const heading = leadWithSeason
    ? `Season ${recap.season}`
    : crossesSeasons
      ? `Season ${recap.season}, Episode ${number}`
      : `Episode ${number}`;

  const body = (text: string) => (
    <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: 0 }}>{text}</p>
  );
  const label = (text: string) => (
    <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-faint)', margin: '18px 0 6px' }}>
      {text}
    </div>
  );

  return (
    <Sheet onClose={closeRecap} label={`Recap of season ${recap.season}${leadWithSeason ? '' : `, episode ${number}`}`}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
        Previously
      </div>
      <h2 className="ct-heading" style={{ fontSize: 20, margin: '0 0 14px', fontWeight: 500 }}>
        {heading}
        {!leadWithSeason && episode?.name ? ` · ${episode.name}` : ''}
      </h2>

      {loading && !season ? (
        <SkeletonText lines={3} label="Loading the previous season" />
      ) : composed ? (
        /* The written recap replaces TMDb's prose rather than sitting above it. Both say the same
           thing, and a reader who has already got the answer doesn't want the raw material
           underneath it. When there's no written recap the branches below are unchanged, so the
           sheet is never worse than it was. */
        <>
          {composed.beats.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px' }}>
              {composed.beats.map((beat, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.45, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 7 }}>
                  <span aria-hidden="true" style={{ color: 'var(--accent-soft)', flex: 'none' }}>&bull;</span>
                  <span>{beat}</span>
                </li>
              ))}
            </ul>
          )}
          {body(composed.text)}
          {/* Says where the boundary is, in the sheet whose whole promise is that there is one.
              Someone about to press play should be able to see that this stops where they did. */}
          <p style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-faint)', margin: '14px 0 0' }}>
            Written from TMDb summaries, through Ep {composed.throughEpisode}. Nothing after it.
          </p>
        </>
      ) : leadWithSeason ? (
        <>
          {body(seasonText)}
          {episodeText && (
            <>
              {label(`Ended on Ep ${number}${episode?.name ? ` · ${episode.name}` : ''}`)}
              {body(episodeText)}
            </>
          )}
        </>
      ) : episodeText ? (
        <>
          {body(episodeText)}
          {seasonAsBackup && (
            <>
              {/* Named honestly. This is the season's blurb, not this episode's — offered because
                  the episode's own line was too short to remember anything from. */}
              {label('This season')}
              {body(seasonText)}
            </>
          )}
        </>
      ) : seasonText ? (
        <>
          {label('This season')}
          {body(seasonText)}
        </>
      ) : (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-faint)', margin: 0 }}>
          TMDb doesn&rsquo;t have a summary for this one.
        </p>
      )}

      {/* Only ever additive: TMDb's text is already on screen above this, so the wait costs the
          reader nothing and the note explains why the sheet might change under them. */}
      {written.status === 'loading' && !composed && (
        <p style={{ fontSize: 12.5, color: 'var(--text-faint)', margin: '14px 0 0' }}>Writing a fuller recap&hellip;</p>
      )}

      <button onClick={closeRecap} className="ct-btn-ghost" style={{ width: '100%', marginTop: 22 }}>Done</button>

      {/* Taught here rather than on the show screen: this costs no pixels on the surface whose job
          is showing cast, and it only reaches people who have already used the feature and know
          what it gives them. A coach mark on the episode rail would have to sell the payoff *and*
          the gesture to someone who asked for neither.

          Shown every time, deliberately — a tip that vanishes is one a returning user can't find
          again, and this names the only gesture in the app. */}
      <p style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--text-faint)', textAlign: 'center', margin: '12px 0 0' }}>
        Tip: double-tap an episode to get here faster.
      </p>
    </Sheet>
  );
}
