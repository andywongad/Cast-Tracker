import type { CastMember, Show } from '../types';
import { useStore } from '../hooks/useStore';
import CastCard from './CastCard';

export default function CastGrid({ show, cast }: { show: Show; cast: CastMember[] }) {
  const { settings } = useStore();
  const cols = settings.castColumns || 2;
  const compact = cols >= 3;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {cast.map((c) => <CastCard key={c.id} show={show} c={c} compact={compact} />)}
    </div>
  );
}
