import { useEffect, useMemo, useState } from 'react';
import type { CastMember, Show } from '../types';
import type { AggregateCastMember, SeasonEpisode } from '../lib/tmdb';
import type { EpisodePerson } from '../lib/episodeCast';
import { missingFromCast } from '../lib/episodeCast';
import CastGrid from './CastGrid';
import CastSkeleton from './CastSkeleton';

/**
 * Two-tier cast view: a Regulars row that persists across every season and episode, and below it
 * the guests for the selected episode.
 *
 * Serves anthologies too. An anthology has no core cast by definition, so its regulars tier is
 * empty and the component renders as a single guest list — the degenerate case of this layout
 * rather than a third one.
 *
 * ## Both tiers show *your* cast, not TMDb's
 *
 * The show page has always rendered `show.cast` — the people you added. Regulars and guests are
 * identified from TMDb and then matched back onto your records by `actorTmdbId`. A regular you
 * haven't added yet is reported as a count, not silently rendered: mixing TMDb's cast into a page
 * that means "your cast" would change what the page is.
 *
 * Characters added by hand have no `actorTmdbId` and so can't be matched to either tier. They get
 * their own section rather than being dropped, since there'd otherwise be no way to reach them.
 */
export default function TieredCastView({
  show,
  cast,
  regulars,
  episode,
  episodePeople,
  onAddMissing,
  onAddPerson,
  guestsAutoAdded,
  searching,
  loading,
}: {
  show: Show;
  cast: CastMember[];
  regulars: AggregateCastMember[];
  episode: SeasonEpisode | null;
  /** Everyone TMDb credits in the selected episode. The single source for placeholders. */
  episodePeople: EpisodePerson[];
  onAddMissing?: () => void;
  /** Adds one person from the episode to the cast. Absent = don't offer placeholders at all. */
  onAddPerson?: (p: EpisodePerson) => void;
  /** True when this show's guests are pulled in on selection rather than tapped in one by one. */
  guestsAutoAdded?: boolean;
  /** A cast search is running, so `cast` is already narrowed to matches. */
  searching?: boolean;
  /** The episode's credits are still in flight. */
  loading?: boolean;
}) {
  const [othersOpen, setOthersOpen] = useState(false);

  // Collapse again when the episode changes — the list it describes is a different one now.
  useEffect(() => { setOthersOpen(false); }, [episode?.number]);

  const isDrama = show.type === 'DRAMA';
  const byActorId = useMemo(() => {
    const m = new Map<number, CastMember>();
    for (const c of cast) if (c.actorTmdbId) m.set(c.actorTmdbId, c);
    return m;
  }, [cast]);

  const regularIds = new Set(regulars.map((r) => r.id));
  const regularMembers = regulars.map((r) => byActorId.get(r.id)).filter((c): c is CastMember => !!c);
  const missingRegulars = regulars.length - regularMembers.length;

  /**
   * Guests come from the episode's own credits, not the season payload's `guest_stars`.
   *
   * The two disagree, and not slightly: TMDb bills Law & Order's guests under `cast` rather than
   * `guest_stars`, so the season payload reported one guest for S25 E3 where the episode credits
   * list eighteen. That was enough to make this tier show a single card while the rest of the
   * episode sat in the collapsed "others" pile below it. `episodePeople` is the same list the
   * placeholders and the auto-add already use, so all three now agree by construction.
   */
  const guestMembers = episodePeople
    .filter((p) => !regularIds.has(p.id))
    .map((p) => byActorId.get(p.id))
    .filter((c): c is CastMember => !!c)
    // A guest who is also a regular belongs in the tier above, not both.
    .filter((c) => !regularMembers.some((r) => r.id === c.id));

  const shownIds = new Set([...regularMembers, ...guestMembers].map((c) => c.id));

  /**
   * Everyone left over splits two ways, and pooling them was the mistake.
   *
   * Someone added by hand has no actorTmdbId, so they can't be matched to any episode ever. Hiding
   * them would strand the record — there'd be no route to open or delete it from this page. They
   * stay visible.
   *
   * Someone matched to TMDb who isn't in this episode is a different case: leaving them out *is*
   * the episode filter working. Listing them underneath undoes it, and on a procedural that's the
   * whole library — a small guest tier followed by a hundred cards, which is the pile this layout
   * exists to avoid. They collapse to a count instead.
   */
  const leftover = cast.filter((c) => !shownIds.has(c.id));
  const handAdded = leftover.filter((c) => !c.actorTmdbId);
  const elsewhereInShow = leftover.filter((c) => !!c.actorTmdbId);

  /**
   * Placeholders come from one list — this episode's credits — and are split across the two tiers
   * by whether the person is one of the show's regulars. Computing each tier from its own source
   * let them disagree about who is in the episode; this can't.
   */
  const missing = onAddPerson ? missingFromCast(episodePeople, cast, isDrama) : [];
  const missingRegularPeople = missing.filter((p) => regularIds.has(p.id));
  const missingGuestPeople = missing.filter((p) => !regularIds.has(p.id));

  const Section = ({ title, note, members, ghosts }: { title: string; note?: string; members: CastMember[]; ghosts?: EpisodePerson[] }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
        {note && <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{note}</div>}
      </div>
      <CastGrid show={show} cast={members} ghosts={ghosts} onAddGhost={onAddPerson} />
    </div>
  );

  return (
    <div>
      {/* Said once, at the top, rather than tucked into a single tier: on these shows the whole
          screen is the selected episode, and everything on it was brought in by selecting it. */}
      {guestsAutoAdded && episode && (
        <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 14 }}>
          Everyone credited on Ep {episode.number}, added automatically.
        </div>
      )}
      {loading && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Loading Ep {episode?.number}
          </div>
          <CastSkeleton rows={2} />
        </div>
      )}

      {!loading && (regularMembers.length > 0 || missingRegularPeople.length > 0) && (
        <Section
          /* "in this episode", not "in every episode": these are the regulars TMDb bills on the
             selected episode, which on a show running twenty-five seasons is not the same set
             throughout. */
          title="Regulars"
          note={`in Ep ${episode?.number ?? ''}${missingRegularPeople.length > 0 ? ` · tap to add ${missingRegularPeople.length}` : ''}`}
          members={regularMembers}
          ghosts={missingRegularPeople}
        />
      )}

      {/* The old bulk button is only needed where placeholders aren't offered — a show whose
          regulars we know about but whose people can't be tapped in individually. */}
      {!onAddPerson && regularMembers.length === 0 && missingRegulars > 0 && onAddMissing && (
        <button
          onClick={onAddMissing}
          style={{ display: 'block', width: '100%', marginBottom: 20, padding: '12px 14px', border: '1px dashed var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add the {missingRegulars} regular{missingRegulars === 1 ? '' : 's'} from this show
        </button>
      )}

      {!loading && episode ? (
        guestMembers.length > 0 || missingGuestPeople.length > 0 ? (
          <Section
            title={`Guests in Ep ${episode.number}`}
            /* Say so when the app added these itself. A cast list that grows on its own is
               worth a word of explanation, not a silent surprise. */
            note={episode.name || undefined}
            members={guestMembers}
            ghosts={missingGuestPeople}
          />
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20 }}>
            TMDb lists no guest stars for Ep {episode.number}.
          </div>
        )
      ) : null}

      {handAdded.length > 0 && (
        <Section
          title="Added by hand"
          note="not linked to TMDb, so they can't be placed in an episode"
          members={handAdded}
        />
      )}

      {/* Everyone from other episodes is hidden while browsing: the screen is the selected
          episode, and on a long-running procedural this pile is most of the library — 458 rows
          behind a count, which is the opposite of "show me this episode".

          It comes back while searching, because search is then the only route to a character from
          an episode you're not on. `cast` is already narrowed to matches by then, so this lists
          the matches rather than the whole library. Hand-added records stay visible either way;
          they can never be matched to an episode, so hiding them would strand them. */}
      {searching && elsewhereInShow.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={() => setOthersOpen((v) => !v)}
            aria-expanded={othersOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', border: 'none', background: 'none', padding: '6px 0', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
              {elsewhereInShow.length} other{elsewhereInShow.length === 1 ? '' : 's'} in your cast
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--text-faint)', flex: 1 }}>not in this episode</span>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ flex: 'none', transform: othersOpen ? 'rotate(180deg)' : 'none' }}>
              <path d="M3 5.5L8 10.5L13 5.5" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {othersOpen && (
            <div style={{ marginTop: 10 }}>
              <CastGrid show={show} cast={elsewhereInShow} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
