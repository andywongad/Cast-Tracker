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
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {cast.map((c) => <CastCard key={c.id} show={show} c={c} compact={compact} />)}
      {/* After the cast, not interleaved: the people you've actually added are what you came for,
          and shuffling placeholders in among them would move a card you were reaching for. */}
      {onAddGhost && (ghosts || []).map((p) => (
        <GhostCastCard key={`g${p.id}`} person={p} isDrama={show.type === 'DRAMA'} onAdd={() => onAddGhost(p)} />
      ))}
    </div>
  );
}
