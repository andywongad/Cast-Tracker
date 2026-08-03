import { useState, useEffect } from 'react';

interface EditControlsProps {
  onSave: () => void;
  onCancel: () => void;
  onUndo: () => void;
  autoSave: boolean;
  isSaving?: boolean;
  hasChanges?: boolean;
}

export default function EditControls({ onSave, onCancel, onUndo, autoSave, isSaving, hasChanges = true }: EditControlsProps) {
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
        bottom: 20,
        right: 20,
        fontSize: 12,
        fontWeight: 700,
        color: 'var(--text-muted)',
        transition: 'opacity 0.3s ease',
        opacity: savedMessage ? 1 : 0.5,
        pointerEvents: 'none',
      }}>
        {isSaving ? '💾 Saving...' : '✓ Saved'}
      </div>
    );
  }

  // Manual save buttons
  return (
    <div style={{
      position: 'fixed',
      bottom: 90,
      left: 0,
      right: 0,
      padding: '12px 16px',
      background: 'var(--bg)',
      borderTop: '1px solid var(--border)',
      display: 'flex',
      gap: 8,
      justifyContent: 'space-between',
      zIndex: 50,
    }}>
      <button
        onClick={onUndo}
        disabled={!hasChanges}
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
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
        }}
        title="Undo changes"
      >
        ↶
      </button>

      <button
        onClick={onSave}
        disabled={!hasChanges || isSaving}
        style={{
          flex: 1,
          height: 44,
          borderRadius: 12,
          border: 'none',
          background: hasChanges ? '#6366F1' : '#9CA3AF',
          color: '#fff',
          fontSize: 14,
          fontWeight: 700,
          cursor: hasChanges && !isSaving ? 'pointer' : 'not-allowed',
          opacity: isSaving ? 0.7 : 1,
          transition: 'all 0.2s ease',
        }}
      >
        {isSaving ? 'Saving...' : 'Save'}
      </button>

      <button
        onClick={onCancel}
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          border: '1px solid var(--input-border)',
          background: 'var(--surface)',
          color: 'var(--text)',
          fontSize: 18,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
        }}
        title="Cancel and close"
      >
        ✕
      </button>
    </div>
  );
}
