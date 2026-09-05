import { useState, useEffect } from 'react';

/**
 * The footer of the character sheet: what was saved, and a way back out of it.
 *
 * There used to be two of these behind a setting — three buttons and an explicit ✓ when auto-save
 * was off, a passive indicator when it was on. The setting is gone and the sheet always saves, so
 * what is left is the half that reports rather than asks.
 *
 * Undo survives the merge, and is the reason this is not just a line of text. Everything the sheet
 * writes is written immediately now, which means clearing a field of notes by accident is a change
 * that has already happened — on this device and, for anyone signed in, on their other ones. Undo
 * is the only way back, so it restores the record as it was when the sheet opened, not as it was
 * one auto-save ago. See the comment on `originalFormRef` in AddCastSheet.
 */

interface EditControlsProps {
  onUndo: () => void;
  isSaving?: boolean;
  /** Undo is only meaningful while something has actually changed since the sheet opened. */
  canUndo?: boolean;
  /** Fade out while an overlapping popover is open — kept mounted so the "Saved" timer survives. */
  hidden?: boolean;
}

export default function EditControls({ onUndo, isSaving, canUndo = true, hidden = false }: EditControlsProps) {
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (isSaving === false) {
      setSavedMessage(true);
      const timer = setTimeout(() => setSavedMessage(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaving]);

  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      right: 'calc(50% - 69px)',
      display: 'flex',
      gap: 10,
      alignItems: 'center',
      zIndex: 50,
      opacity: hidden ? 0 : 1,
      pointerEvents: hidden ? 'none' : 'auto',
      transition: 'opacity 0.15s ease',
    }}>
      {/* Fades to half opacity between saves rather than disappearing: on a sheet with no save
          button, the only thing telling you your typing is being kept is this line. */}
      <div style={{
        fontSize: 14,
        fontWeight: 700,
        color: 'var(--text-muted)',
        transition: 'opacity 0.3s ease',
        opacity: savedMessage ? 1 : 0.5,
        pointerEvents: 'none',
      }}>
        {isSaving ? '⟳ Saving...' : '✓ Saved'}
      </div>

      <button
        onClick={onUndo}
        disabled={!canUndo}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--input-border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 18,
          cursor: canUndo ? 'pointer' : 'not-allowed',
          opacity: canUndo ? 1 : 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        title="Undo everything since this sheet opened"
      >
        ↶
      </button>
    </div>
  );
}
