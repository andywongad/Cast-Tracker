import type { CastMember, Show } from '../types';
import type { EpisodePerson } from '../lib/episodeCast';
import { metBy } from '../lib/episodeCast';
import type { FirstSeasonMap } from '../lib/firstSeason';
import CastGrid from './CastGrid';
import CastSkeleton from './CastSkeleton';

/**
 * A serialised show, viewed one episode at a time without losing the people behind you.
 *
 * Two sections. The top one is who is credited on the episode you picked — the answer to "who am
 * I looking at right now". The second is everyone you have already met, which is the answer to
 * "who was that, again?", and on a show where a character introduced four episodes ago comes back
 * without a name badge, that second question is the one this app exists for. A procedural can get
 * away with showing only the episode because its episodes stand alone; this kind cannot.
 *
 * Nobody from later than your position appears in either section, so scrubbing forward on the
 * rail still can't show you a character you haven't met.
 */
/**
 * A titled block of cards. At module scope on purpose.
 *
 * Declared inside the component body it was a new component *type* on every render, so React could
 * not reconcile it and tore the whole subtree down instead — measured at 24 card nodes destroyed
 * and 24 rebuilt for a single keystroke in the search box, every image with them. Hoisting makes
 * it the same type across renders, which is what lets the memo on the cards do anything.
 */
function Section({
  show,
  title,
  note,
  members,
  ghosts,
  onAddGhost,
}: {
  show: Show;
  title: string;
  note?: string;
  members: CastMember[];
  ghosts?: EpisodePerson[];
  onAddGhost?: (p: EpisodePerson) => void;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
        {note && <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{note}</div>}
      </div>
      <CastGrid show={show} cast={members} ghosts={ghosts} onAddGhost={onAddGhost} />
    </div>
  );
}

export default function SerialCastView({
  show,
  cast,
  episodePeople,
  episodeNumber,
  at,
  firstSeasons,
  loading,
  ghosts,
  onAddGhost,
  searching,
}: {
  show: Show;
  cast: CastMember[];
  /** Everyone TMDb credits on the selected episode. */
  episodePeople: EpisodePerson[];
  episodeNumber: number;
  /** Where the viewer is in the show — the bound on what "so far" can include. */
  at: { season: number; episode: number };
  firstSeasons: FirstSeasonMap | null;
  loading: boolean;
  ghosts?: EpisodePerson[];
  onAddGhost?: (p: EpisodePerson) => void;
  searching?: boolean;
}) {
  const episodeIds = new Set(episodePeople.map((p) => p.id));
  const inEpisode = cast.filter((c) => c.actorTmdbId && episodeIds.has(c.actorTmdbId));
  const inEpisodeIds = new Set(inEpisode.map((c) => c.id));

  /**
   * Everyone else you've met by now. Characters added by hand have no TMDb id and can never match
   * an episode, so they land here rather than being stranded — you typed them in, you've met them.
   */
  const metSoFar = cast.filter(
    (c) => !inEpisodeIds.has(c.id) && (!c.actorTmdbId || metBy(c, at, firstSeasons)),
  );

  // While searching, the episode split is noise: you're looking for one person and you don't care
  // which half they're in. One list of matches.
  if (searching) return <CastGrid show={show} cast={cast} />;

  return (
    <div>
      {loading ? (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Everyone credited on Ep {episodeNumber}
          </div>
          <CastSkeleton rows={2} />
        </div>
      ) : inEpisode.length > 0 ? (
        <Section show={show} title={`Everyone credited on Ep ${episodeNumber}`} members={inEpisode} ghosts={ghosts} onAddGhost={onAddGhost} />
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20 }}>
          TMDb lists no cast for Ep {episodeNumber}.
        </div>
      )}

      {/* No placeholders on this section — they belong to the episode above, and passing them to
          both would render each one twice. */}
      {metSoFar.length > 0 && (
        <Section show={show} title="Everyone you've met so far" note={`${metSoFar.length}`} members={metSoFar} />
      )}
    </div>
  );
}
