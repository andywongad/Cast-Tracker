import React, { useEffect, useRef } from 'react';

/**
 * The one bottom sheet, and the dismissal contract behind it.
 *
 * Every overlay in the app used to hand-roll its own: eleven copied the scrim/sheet/grabber markup
 * and wired the backdrop themselves, Feedback built a separate overlay from scratch and wired
 * nothing, and not one of them listened for Escape. Dismissal is the kind of behaviour that has to
 * be identical everywhere or it reads as broken, so it lives here rather than in thirteen places.
 *
 * A sheet closes four ways, and they are all the same close:
 *   - the backdrop, handled here
 *   - Escape, handled here
 *   - the system back gesture, handled by the layer stack in useUI (each sheet is a history entry)
 *   - whatever close button the sheet draws for itself
 *
 * Callers gate on their own open flag and render this only when open, which is what every one of
 * them already did — so mounting means open and there is no `open` prop to keep in sync.
 */

/**
 * Innermost-last list of everything currently dismissible.
 *
 * Sheets stack — a character sheet can sit under Settings — and every open one has a live keydown
 * listener on window. Without knowing which is on top, one Escape would close all of them.
 */
const openStack: object[] = [];

/**
 * Escape closes the topmost dismissible thing. Split out from the component because two overlays
 * aren't bottom sheets — the in-app browser is full screen and the photo cropper is centred — but
 * should still answer to Escape.
 */
export function useDismissible(onClose: () => void) {
  // Held in a ref so the listener isn't torn down and re-registered on every render of the sheet's
  // contents, which would churn this instance's position in the stack while it's open.
  const cb = useRef(onClose);
  cb.current = onClose;
  const token = useRef({});

  useEffect(() => {
    const me = token.current;
    openStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (openStack[openStack.length - 1] !== me) return;
      e.preventDefault();
      cb.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(me);
      if (i !== -1) openStack.splice(i, 1);
    };
  }, []);
}

export default function Sheet({
  onClose,
  label,
  sheetStyle,
  scrimStyle,
  children,
}: {
  onClose: () => void;
  /** Names the dialog for screen readers. Sheets with a visible title can pass that. */
  label?: string;
  sheetStyle?: React.CSSProperties;
  scrimStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  useDismissible(onClose);
  return (
    <div className="ct-scrim" style={scrimStyle} onClick={onClose}>
      <div
        className="ct-sheet"
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ct-sheet-grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
