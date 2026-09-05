import type { CastMember, Show } from '../types';
import type { EpisodePerson } from '../lib/episodeCast';
import { useStore } from '../hooks/useStore';
import CastCard from './CastCard';
import GhostCastCard from './GhostCastCard';

export default function CastGrid({
  show,
  cast,
  ghosts,
  onAddGhost,
}: {
  show: Show;
  cast: CastMember[];
  /** People in the selected episode who aren't in `cast` yet. Rendered as placeholders. */
  ghosts?: EpisodePerson[];
  onAddGhost?: (p: EpisodePerson) => void;
}) {
  const { settings } = useStore();
  const cols = settings.castColumns || 2;
  const compact = cols >= 3;
  /**
   * The same setting as a card width, for the desktop layout — see the note in HomeScreen. Cast
   * cards are smaller than posters, so the steps are lower: 240/190/155 put four, five and six in
   * a 1080px row. Ignored below 1024px, where the count below is what runs.
   */
  const colMin = cols === 2 ? '240px' : cols === 3 ? '190px' : '155px';
  return (
    <div className="ct-cast-grid" style={{ ['--col-min' as string]: colMin, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {cast.map((c) => <CastCard key={c.id} c={c} compact={compact} />)}
      {/* After the cast, not interleaved: the people you've actually added are what you came for,
          and shuffling placeholders in among them would move a card you were reaching for. */}
      {onAddGhost && (ghosts || []).map((p) => (
        <GhostCastCard key={`g${p.id}`} person={p} isDrama={show.type === 'DRAMA'} onAdd={() => onAddGhost(p)} />
      ))}
    </div>
  );
}
