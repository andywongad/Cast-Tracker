import { useState, useEffect } from 'react';

interface EditControlsProps {
  onSave: () => void;
  onCancel: () => void;
  onUndo: () => void;
  autoSave: boolean;
  isSaving?: boolean;
  hasChanges?: boolean;
  /** Fade out while an overlapping popover is open — kept mounted so the "Saved" timer survives. */
  hidden?: boolean;
}

export default function EditControls({ onSave, onCancel, onUndo, autoSave, isSaving, hasChanges = true, hidden = false }: EditControlsProps) {
  const [savedMessage, setSavedMessage] = useState(false);

  useEffect(() => {
    if (isSaving === false && autoSave) {
      setSavedMessage(true);
      const timer = setTimeout(() => setSavedMessage(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, autoSave]);

  // Auto-save feedback
  if (autoSave) {
    return (
      <div style={{
        position: 'fixed',
        bottom: 90,
        right: 'calc(50% - 69px + 148px + 8px)',
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text-muted)',
        transition: 'opacity 0.3s ease',
        opacity: hidden ? 0 : savedMessage ? 1 : 0.5,
        pointerEvents: 'none',
      }}>
        {isSaving ? '⟳ Saving...' : '✓ Saved'}
      </div>
    );
  }

  // Manual save buttons
  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      right: 'calc(50% - 69px)',
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      zIndex: 50,
      opacity: hidden ? 0 : 1,
      pointerEvents: hidden ? 'none' : 'auto',
      transition: 'opacity 0.15s ease',
    }}>
      <button
        onClick={onUndo}
        disabled={!hasChanges}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--input-border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 18,
          cursor: hasChanges ? 'pointer' : 'not-allowed',
          opacity: hasChanges ? 1 : 0.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        title="Undo changes"
      >
        ↶
      </button>

      <button
        onClick={onSave}
        disabled={!hasChanges || isSaving}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: hasChanges ? 'var(--text)' : '#9CA3AF',
          color: '#fff',
          fontSize: 18,
          cursor: hasChanges && !isSaving ? 'pointer' : 'not-allowed',
          opacity: isSaving ? 0.7 : 1,
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        {isSaving ? '⟳' : '✓'}
      </button>

      <button
        onClick={onCancel}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: '1px solid var(--input-border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        }}
        title="Cancel and close"
      >
        ✕
      </button>
    </div>
  );
}
