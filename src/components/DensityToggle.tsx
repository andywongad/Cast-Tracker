/**
 * Compact column-count control. Lives on the page rather than in Settings because density is
 * judged by looking at the grid — behind a sheet you can't see what you're changing.
 * Sized to sit inside an existing row, not to claim one of its own.
 */
/**
 * N vertical bars standing in for N columns. Drawn from the count rather than hand-authored
 * per option, so adding a 5-up later needs no new artwork. Bars beat a 2-row grid of squares
 * here: at 4 columns inside a 14px box, squares land under 2px and turn to mush.
 */
function ColumnsIcon({ count }: { count: number }) {
  const box = 14;
  const gap = 1.6;
  const width = (box - gap * (count - 1)) / count;
  return (
    <svg width={box} height={box} viewBox={`0 0 ${box} ${box}`} aria-hidden="true" focusable="false">
      {Array.from({ length: count }, (_, i) => (
        <rect key={i} x={i * (width + gap)} y={1} width={width} height={box - 2} rx={Math.min(1, width / 2)} fill="currentColor" />
      ))}
    </svg>
  );
}

export default function DensityToggle({
  value,
  options,
  onChange,
  label = 'Columns',
}: {
  value: number;
  options: number[];
  onChange: (n: number) => void;
  label?: string;
}) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', gap: 2, background: 'var(--surface)', borderRadius: 999, padding: 2, flex: 'none' }}>
      {options.map((n) => {
        const active = value === n;
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            aria-label={`${n} columns`}
            aria-pressed={active}
            title={`${n} columns`}
            style={{
              width: 30, height: 26, border: 'none', borderRadius: 999, cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--icon-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <ColumnsIcon count={n} />
          </button>
        );
      })}
    </div>
  );
}
