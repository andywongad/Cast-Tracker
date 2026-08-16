import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';

/**
 * Placeholder cards shown while an episode's credits are loading.
 *
 * Delayed on purpose. An episode takes about 180ms on a first load and 80ms once the edge has it,
 * so a skeleton that appeared instantly would spend most of its life flashing on and off for
 * episodes that were already cached. It only shows if the wait is long enough to read as a wait,
 * which on a phone over cellular it usually is.
 *
 * Matches the real grid's column count and card proportions so the layout doesn't jump when the
 * cards arrive.
 */
const APPEAR_AFTER_MS = 150;

export default function CastSkeleton({ rows = 2 }: { rows?: number }) {
  const { settings } = useStore();
  const cols = settings.castColumns || 2;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), APPEAR_AFTER_MS);
    return () => clearTimeout(t);
  }, []);

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
