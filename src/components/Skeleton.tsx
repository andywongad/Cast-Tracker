import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * The shared parts of a loading placeholder.
 *
 * CastSkeleton got these right first and was the only thing in the app that had them: the shimmer
 * class, and — the part that is easy to miss — a delay before appearing. Everywhere else said
 * "Searching TMDb…" or "Loading episodes…" in muted text, which is a different visual language for
 * the same moment and tells you nothing about the shape of what is coming.
 *
 * This exists so the rest of the app can match it rather than approximate it. Anything that waits
 * should reach for these, not for `.ct-skeleton` directly, or the delay gets forgotten one call
 * site at a time.
 */

/**
 * How long a wait has to last before it is worth acknowledging.
 *
 * From CastSkeleton, where the reasoning was measured: an episode's credits take about 180ms cold
 * and 80ms once the edge has them, so a placeholder that appeared instantly would spend most of
 * its life flashing on and off for things that were already cached. A flash of skeleton is worse
 * than no skeleton — it reads as a glitch rather than as progress.
 */
export const SKELETON_DELAY_MS = 150;

/** True once the wait has lasted long enough to read as a wait. */
export function useSkeletonVisible(delay: number = SKELETON_DELAY_MS): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return visible;
}

/**
 * One shimmering bar. The unit every skeleton in the app is built from.
 *
 * Deliberately takes explicit dimensions rather than defaulting to something: a placeholder is
 * only doing its job if it is the size of the thing it stands in for, so the caller has to have
 * looked at what it is replacing.
 */
export function SkeletonBar({ width, height, radius = 6, style }: {
  width?: number | string;
  height: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return <div className="ct-skeleton" style={{ width, height, borderRadius: radius, ...style }} />;
}

/**
 * The delay and the announcement, wrapped around whatever shape a caller needs.
 *
 * `label` is what a screen reader hears, and it is required for a reason: visually a skeleton says
 * "something is coming" through its shape, and there is no shape to hear. It should name the thing
 * being waited for — "Searching TMDb", not "Loading".
 */
export function Skeleton({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  const visible = useSkeletonVisible();
  if (!visible) return null;
  return (
    <div aria-busy="true" aria-label={label} style={style}>
      {children}
    </div>
  );
}

/**
 * A list of rows, each a thumbnail beside a line or two of text.
 *
 * The shape every search result in this app happens to be — the TMDb lists on the home screen and
 * in the add-show sheet, and the credits list on a character. Widths alternate so the block reads
 * as several different titles rather than as a striped pattern; the same trick CastSkeleton uses
 * on its captions.
 */
export function SkeletonRows({ count, label, thumb = 40, thumbRadius = 10, lines = 2, gap = 4, bordered = false, style }: {
  count: number;
  label: string;
  /** Square thumbnail edge, or 0 for rows that are text only. */
  thumb?: number;
  thumbRadius?: number;
  lines?: 1 | 2;
  gap?: number;
  /** Matches result rows that draw their own border and surface. */
  bordered?: boolean;
  style?: CSSProperties;
}) {
  return (
    <Skeleton label={label} style={style}>
      <div style={{ display: 'flex', flexDirection: 'column', gap }}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: bordered ? 8 : 0,
              border: bordered ? '1px solid var(--border)' : undefined,
              background: bordered ? 'var(--surface)' : undefined,
              borderRadius: bordered ? 12 : undefined,
            }}
          >
            {thumb > 0 && <SkeletonBar width={thumb} height={thumb} radius={thumbRadius} style={{ flex: 'none' }} />}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <SkeletonBar height={13} width={i % 3 === 0 ? '55%' : i % 3 === 1 ? '75%' : '65%'} />
              {lines === 2 && <SkeletonBar height={11} width="30%" />}
            </div>
          </div>
        ))}
      </div>
    </Skeleton>
  );
}

/**
 * Stacked text lines, for a paragraph that hasn't arrived.
 *
 * The last line is short, because that is what the end of a paragraph looks like and a block of
 * equal bars reads as a table.
 */
export function SkeletonText({ lines = 3, label, height = 13, style }: {
  lines?: number;
  label: string;
  height?: number;
  style?: CSSProperties;
}) {
  return (
    <Skeleton label={label} style={style}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: lines }, (_, i) => (
          <SkeletonBar key={i} height={height} width={i === lines - 1 ? '45%' : '100%'} />
        ))}
      </div>
    </Skeleton>
  );
}
