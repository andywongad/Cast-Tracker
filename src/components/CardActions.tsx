import React from 'react';

/**
 * The edit + share pair that hangs off the top-right corner of a card or tile.
 *
 * Shared by CastCard and ShowTile so the same two actions can't drift apart again — they were
 * previously duplicated with different sizes, fills and icon paths in each file.
 *
 * The host element must be `position: relative`, and the buttons deliberately live *outside* any
 * wrapper with `overflow: hidden` (image wrappers clip them otherwise).
 */
const SIZE = 26;
const ICON = 11;

const actionBtn = (size: number): React.CSSProperties => ({
  width: size, height: size, flex: 'none', borderRadius: 999,
  background: 'rgba(0,0,0,0.6)',
  color: '#fff', border: 'none',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0, boxShadow: '0 2px 6px rgba(0,0,0,0.16)',
});

function EditIcon({ px }: { px: number }) {
  return <svg width={px} height={px} viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.7 12l-2.9.7.7-2.9 7.8-7.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" fill="none" /></svg>;
}

function ShareIcon({ px }: { px: number }) {
  return <svg width={px} height={px} viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="3.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="12" cy="12.5" r="1.8" stroke="currentColor" strokeWidth="1.4" /><path d="M5.6 7.2l4.6-3.2M5.6 8.8l4.6 3.2" stroke="currentColor" strokeWidth="1.4" /></svg>;
}

export default function CardActions({ onEdit, onShare }: { onEdit: () => void; onShare: () => void }) {
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
  const btn = actionBtn(SIZE);
  const icon = ICON;
  return (
    <div style={{ position: 'absolute', top: -11, right: -11, display: 'flex', gap: 4, zIndex: 2 }} onClick={(e) => e.stopPropagation()}>
      <button onClick={stop(onEdit)} aria-label="Edit" style={btn}><EditIcon px={icon} /></button>
      {/* Nudged 2px inward so the pair sits optically centred on the rounded corner. */}
      <button onClick={stop(onShare)} aria-label="Share" style={{ ...btn, position: 'relative', right: 2 }}><ShareIcon px={icon - 1} /></button>
    </div>
  );
}
