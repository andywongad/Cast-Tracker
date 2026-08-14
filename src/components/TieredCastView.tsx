import { useMemo } from 'react';
import type { CastMember, Show } from '../types';
import type { AggregateCastMember, SeasonEpisode } from '../lib/tmdb';
import type { CastMeta } from '../lib/showShape';
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
 * Characters added by hand have no `actorTmdbId` and so can't be matched to either tier. They
 * appear under "Also in your cast" rather than being dropped.
 */
export default function TieredCastView({
  show,
  cast,
  regulars,
  allCredits,
  episode,
  onAddMissing,
}: {
  show: Show;
  cast: CastMember[];
  regulars: AggregateCastMember[];
  /** Every person in the series' aggregate credits — the source of per-guest episode totals. */
  allCredits: AggregateCastMember[];
  episode: SeasonEpisode | null;
  onAddMissing?: () => void;
}) {
  const byActorId = useMemo(() => {
    const m = new Map<number, CastMember>();
    for (const c of cast) if (c.actorTmdbId) m.set(c.actorTmdbId, c);
    return m;
  }, [cast]);

  /**
   * Episode totals for every person TMDb knows about, so a guest card can say "1 ep" or "9 eps".
   * That distinction is the entire point of this layout — a one-off and a recurring guest look
   * identical otherwise.
   */
  const meta = useMemo(() => {
    const m = new Map<number, CastMeta>();
    for (const p of allCredits) m.set(p.id, { episodeCount: p.episodeCount });
    return m;
  }, [allCredits]);

  const regularMembers = regulars.map((r) => byActorId.get(r.id)).filter((c): c is CastMember => !!c);
  const missingRegulars = regulars.length - regularMembers.length;

  const guestMembers = (episode?.guests || [])
    .map((g) => byActorId.get(g.id))
    .filter((c): c is CastMember => !!c)
    // A guest who is also a regular belongs in the tier above, not both.
    .filter((c) => !regularMembers.some((r) => r.id === c.id));

  const shownIds = new Set([...regularMembers, ...guestMembers].map((c) => c.id));
  const unmatched = cast.filter((c) => !shownIds.has(c.id));

  const Section = ({ title, note, members }: { title: string; note?: string; members: CastMember[] }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
        {note && <div style={{ fontSize: 12.5, color: 'var(--text-faint)' }}>{note}</div>}
      </div>
      <CastGrid show={show} cast={members} meta={meta} />
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

      {unmatched.length > 0 && (
        <Section
          title="Also in your cast"
          note={`${unmatched.length} not matched to this episode`}
          members={unmatched}
        />
      )}
    </div>
  );
}
