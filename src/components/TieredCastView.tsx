import { useEffect, useMemo, useState } from 'react';
import type { CastMember, Show } from '../types';
import type { AggregateCastMember, SeasonEpisode } from '../lib/tmdb';
import CastGrid from './CastGrid';

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
  onAddMissing,
}: {
  show: Show;
  cast: CastMember[];
  regulars: AggregateCastMember[];
  episode: SeasonEpisode | null;
  onAddMissing?: () => void;
}) {
  const [othersOpen, setOthersOpen] = useState(false);

  // Collapse again when the episode changes — the list it describes is a different one now.
  useEffect(() => { setOthersOpen(false); }, [episode?.number]);

  const byActorId = useMemo(() => {
    const m = new Map<number, CastMember>();
    for (const c of cast) if (c.actorTmdbId) m.set(c.actorTmdbId, c);
    return m;
  }, [cast]);

  const regularMembers = regulars.map((r) => byActorId.get(r.id)).filter((c): c is CastMember => !!c);
  const missingRegulars = regulars.length - regularMembers.length;

  const guestMembers = (episode?.guests || [])
    .map((g) => byActorId.get(g.id))
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

  const Section = ({ title, note, members }: { title: string; note?: string; members: CastMember[] }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
        {note && <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{note}</div>}
      </div>
      <CastGrid show={show} cast={members} />
    </div>
  );

  return (
    <div>
      {regularMembers.length > 0 && (
        <Section
          title="Regulars"
          note={`in every episode${missingRegulars > 0 ? ` · ${missingRegulars} not added yet` : ''}`}
          members={regularMembers}
        />
      )}

      {regularMembers.length === 0 && missingRegulars > 0 && onAddMissing && (
        <button
          onClick={onAddMissing}
          style={{ display: 'block', width: '100%', marginBottom: 20, padding: '12px 14px', border: '1px dashed var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          + Add the {missingRegulars} regular{missingRegulars === 1 ? '' : 's'} from this show
        </button>
      )}

      {episode ? (
        guestMembers.length > 0 ? (
          <Section title={`Guests in Ep ${episode.number}`} note={episode.name || undefined} members={guestMembers} />
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 20 }}>
            No guests from Ep {episode.number} are in your cast yet.
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

      {elsewhereInShow.length > 0 && (
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
