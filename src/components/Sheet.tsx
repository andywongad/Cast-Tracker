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
 * Focus behaviour for a modal: move in on open, keep Tab inside, hand it back on close.
 *
 * The sheets already said `role="dialog"` and `aria-modal="true"`, which is a promise to assistive
 * technology that the rest of the page is inert. Nothing enforced it: focus stayed on whatever
 * button opened the sheet, Tab walked straight out into the cast grid behind the scrim, and
 * closing left focus on an element that no longer existed — which drops it to the body and sends a
 * screen reader back to the top of the app.
 */
export function useModalFocus(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const returnTo = document.activeElement as HTMLElement | null;

    const focusables = () =>
      [...node.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((el) => el.offsetParent !== null);

    // The sheet itself when it has no controls yet, so focus is inside the dialog either way.
    const first = focusables()[0] ?? node;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) { e.preventDefault(); return; }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends. Recomputed per keypress because sheets grow and shrink as fields open.
      if (e.shiftKey && (active === firstItem || !node.contains(active))) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    node.addEventListener('keydown', onKey);
    return () => {
      node.removeEventListener('keydown', onKey);
      // Back where it came from, if that element is still on the page.
      if (returnTo && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, [ref]);
}

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
  const sheetRef = useRef<HTMLDivElement>(null);
  useModalFocus(sheetRef);
  return (
    <div className="ct-scrim" style={scrimStyle} onClick={onClose}>
      <div
        ref={sheetRef}
        className="ct-sheet"
        style={sheetStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ct-sheet-grabber" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
