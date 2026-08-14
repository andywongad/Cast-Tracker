import type { CastMember, Show } from '../types';
import type { CastMeta } from '../lib/showShape';
import { useStore } from '../hooks/useStore';
import CastCard from './CastCard';

export default function CastGrid({
  show,
  cast,
  meta,
  currentSeason,
}: {
  show: Show;
  cast: CastMember[];
  /** TMDb-derived episode counts and season ranges, keyed by actorTmdbId. Absent = show none. */
  meta?: Map<number, CastMeta>;
  /** Drives the "new in S<N>" badge. Omit to suppress it. */
  currentSeason?: number;
}) {
  const { settings } = useStore();
  const cols = settings.castColumns || 2;
  const compact = cols >= 3;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}>
      {cast.map((c) => (
        <CastCard
          key={c.id}
          show={show}
          c={c}
          compact={compact}
          meta={c.actorTmdbId ? meta?.get(c.actorTmdbId) : undefined}
          currentSeason={currentSeason}
        />
      ))}
    </div>
  );
}
