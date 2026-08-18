import { memo, useState } from 'react';
import type { EpisodePerson } from '../lib/episodeCast';
import { personLabel } from '../lib/episodeCast';
import { initials, bgStyle } from '../lib/utils';

/**
 * Someone in the selected episode who isn't in your cast yet.
 *
 * Sits in the same grid as the real cards and keeps their footprint, so adding one doesn't reflow
 * the row — but it's outlined and dashed rather than filled, and its photo is faded, because the
 * whole point is that it isn't yours yet. Tapping it is the only thing that writes anything.
 *
 * Deliberately not a link to the character sheet. There is no record to open: everything the sheet
 * shows — your nickname, your notes, the AKA list — only exists once you've added them.
 */
function GhostCastCard({
  person,
  isDrama,
  onAdd,
}: {
  person: EpisodePerson;
  isDrama: boolean;
  onAdd: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const name = personLabel(person, isDrama);

  return (
    <button
      onClick={() => { setAdding(true); onAdd(); }}
      disabled={adding}
      aria-label={`Add ${name} to your cast`}
      className="ct-card ct-card-ghost"
      style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
    >
      <div
        style={{
          position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden',
          backgroundColor: 'var(--surface)', marginBottom: 10,
          // Faded rather than hidden: the face is the fastest way to recognise who this is, which
          // is exactly the decision being asked for.
          opacity: 0.55,
          ...bgStyle(person.photo),
        }}
      >
        {!person.photo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: 'var(--initials-tint)' }}>
            {initials(name)}
          </div>
        )}
      </div>

      <div className="ct-heading" style={{ fontSize: 15, lineHeight: 1.25, overflowWrap: 'anywhere', color: 'var(--text-secondary)' }}>{name}</div>
      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}>
        {adding ? 'Adding…' : '+ Add'}
      </div>
    </button>
  );
}

export default memo(GhostCastCard);
