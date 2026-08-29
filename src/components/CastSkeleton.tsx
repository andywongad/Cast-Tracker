import { useStore } from '../hooks/useStore';
import { useSkeletonVisible } from './Skeleton';

/**
 * Placeholder cards shown while an episode's credits are loading.
 *
 * Delayed on purpose — see useSkeletonVisible in Skeleton.tsx, which is where that reasoning and
 * the timing now live, shared with every other placeholder in the app.
 *
 * Matches the real grid's column count and card proportions so the layout doesn't jump when the
 * cards arrive.
 */
export default function CastSkeleton({ rows = 2 }: { rows?: number }) {
  const { settings } = useStore();
  const cols = settings.castColumns || 2;
  const visible = useSkeletonVisible();

  if (!visible) return null;

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 12 }}
      aria-busy="true"
      aria-label="Loading this episode's cast"
    >
      {Array.from({ length: cols * rows }, (_, i) => (
        <div key={i} className="ct-card" style={{ cursor: 'default' }}>
          <div className="ct-skeleton" style={{ aspectRatio: '1', borderRadius: 14, marginBottom: 10 }} />
          <div className="ct-skeleton" style={{ height: 13, borderRadius: 6, width: i % 3 === 0 ? '60%' : '85%' }} />
        </div>
      ))}
    </div>
  );
}
