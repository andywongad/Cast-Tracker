/**
 * `?add=<tmdbId>` — the way in from a public show page.
 *
 * /show/1399 is readable by anyone with no account and no library, which is the point of it. Its
 * one call to action has to land somewhere useful, and `?show=` could not be it: that carries a
 * local id minted by `genId` on one device, and `useUI` only opens it when a show with that id is
 * already in this browser's storage. A stranger following it would be dropped on the home screen
 * with nothing open and no idea why.
 *
 * So the public link names the show the only way both sides can agree on — its TMDb id — and the
 * app turns that into either the show you already have or a filled-in add form.
 *
 * ## Why this is read at import time
 *
 * `useUI` normalises the URL as it mounts. Anything still in the query string when that happens is
 * gone before a component effect could look at it, which is exactly how the share fragment was
 * lost once before — App.tsx says that bug cost a day. So this is consumed at module scope beside
 * the sign-in code and the share payload, not in an effect.
 *
 * Reading it also removes it, for the same reason those do: a reload should not re-open the add
 * form for a show you have already decided about, and the URL that ends up in history should be
 * the plain one.
 */

/** Pure half, so the parsing is testable without a window. */
export function parseAddParam(search: string): number | null {
  try {
    const raw = new URLSearchParams(search).get('add');
    if (!raw) return null;
    // TMDb ids are positive integers. Anything else arrived by hand or by accident; either way
    // there is nothing to look up, and `Number.parseInt` would happily turn "12abc" into 12.
    if (!/^\d{1,9}$/.test(raw)) return null;
    const id = Number(raw);
    return id > 0 ? id : null;
  } catch {
    return null;
  }
}

/** Reads `?add=`, strips it from the URL, and hands back the id once. */
export function takeAddFromUrl(): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const id = parseAddParam(window.location.search);
    if (id === null) return null;
    const params = new URLSearchParams(window.location.search);
    params.delete('add');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash);
    return id;
  } catch {
    return null;
  }
}
