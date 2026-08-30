import { useEffect, useMemo, useRef, useState } from 'react';
import type { CastMember, MapCell, MapRelationship, MapRelKind, Show } from '../types';
import { useStore } from '../hooks/useStore';
import { bgStyle, genId, initials } from '../lib/utils';
import { MAP_LINE, MAP_HEART } from '../lib/theme';
import { buildEdges, parentIdsOf, KINSHIP_KINDS, REL_KINDS } from '../lib/relationshipEdges';

const COLS = 6;
const ROWS = 8;
const DEFAULT_TOP_ROW = -3; // anchor default layout near the top so images are visible without scrolling

function epKeyFor(season: number, ep: string) { return `${season}_${ep}`; }
function getEpRel(c: CastMember, epKey: string): MapRelationship[] { return c.relByEp?.[epKey] || []; }
function getEpCell(c: CastMember, epKey: string): MapCell | null { return c.mapCellByEp?.[epKey] || null; }

const cellKey = (cell: MapCell) => `${cell.r}:${cell.c}`;

/**
 * Board size, drawn as the thing it changes: one face, small or large.
 *
 * Not the column bars used for the grids — those say "how many across", and this says "how big",
 * which is a different question on a board whose layout doesn't reflow. Same shape and weight as
 * that control though, because it sits in the same kind of row and does the same kind of job.
 *
 * Sits alongside the pinch gesture rather than instead of it. A gesture is the natural reach on a
 * phone and invisible everywhere else: nothing on screen says the second size exists, or which one
 * you are in. These two buttons answer both, and cost one tap for anyone who would rather not
 * pinch at all.
 */
function MapSizeToggle({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="group" aria-label="Map size" style={{ display: 'inline-flex', gap: 2, background: 'var(--surface)', borderRadius: 999, padding: 2, flex: 'none' }}>
      {[1, 2].map((z) => {
        const active = value === z;
        return (
          <button
            key={z}
            onClick={() => onChange(z)}
            aria-label={z === 1 ? 'Fit the whole map' : 'Bigger faces, drag to move around'}
            aria-pressed={active}
            title={z === 1 ? 'Fit the whole map' : 'Bigger faces'}
            style={{
              width: 30, height: 26, border: 'none', borderRadius: 999, cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--icon-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r={z === 1 ? 3.2 : 6} fill="currentColor" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Dating-show split: women left, men right, everyone else centred. Falls back to the full width.
 *
 * Off on scripted shows. It is a layout for a format where the two sides are the premise; on a
 * family tree it would put a mother and her son at opposite ends of the board.
 */
function colRange(c: CastMember, split: boolean): [number, number] {
  if (!split) return [0, COLS - 1];
  if (c.gender === 'Female') return [0, 2];
  if (c.gender === 'Male') return [4, COLS - 1];
  return [3, 3];
}

/** First unoccupied cell, scanning the preferred columns top-down before widening to all of them. */
function firstFreeCell(occupied: Set<string>, colMin: number, colMax: number): MapCell {
  for (const [lo, hi] of [[colMin, colMax], [0, COLS - 1]] as [number, number][]) {
    for (let r = DEFAULT_TOP_ROW; r < DEFAULT_TOP_ROW + ROWS * 4; r++) {
      for (let c = lo; c <= hi; c++) {
        if (!occupied.has(`${r}:${c}`)) return { r, c };
      }
    }
  }
  return { r: DEFAULT_TOP_ROW, c: 0 };
}

/**
 * Resolve every visible cast member to a cell for this episode.
 *
 * Positions used to be derived from each person's index in the list, so adding or removing anyone
 * recomputed the whole layout and shuffled people who hadn't moved. Now a cell is claimed once and
 * persisted, and newcomers only ever take cells nobody holds — so existing people never move, and
 * nobody lands on top of anyone.
 *
 * Returns the full map for rendering plus just the newly claimed cells, which the caller persists.
 */
function resolveCells(cast: CastMember[], epKey: string, kinship: boolean): { byId: Record<string, MapCell>; toPersist: Record<string, MapCell> } {
  const byId: Record<string, MapCell> = {};
  const toPersist: Record<string, MapCell> = {};
  const occupied = new Set<string>();

  // Lock in saved positions first so a newcomer can never be handed an occupied cell.
  cast.forEach((c) => {
    const cell = getEpCell(c, epKey);
    if (cell) { byId[c.id] = cell; occupied.add(cellKey(cell)); }
  });

  const split = !kinship && cast.some((c) => c.gender === 'Female') && cast.some((c) => c.gender === 'Male');
  cast.forEach((c) => {
    if (byId[c.id]) return;
    /**
     * On a scripted board, someone whose parent is already placed starts under them rather than in
     * the first free slot at the top — so a tree comes out looking like a tree without anyone
     * having to drag.
     *
     * Deliberately only for newcomers. The board's rule is that a placed person never moves, which
     * is what stops the layout reshuffling under someone mid-edit; a real generational tidy-up is a
     * separate, explicit action and is not this.
     */
    let cell: MapCell | null = null;
    if (kinship) {
      const parents = parentIdsOf(c.id, cast, (m) => getEpRel(m, epKey))
        .map((id) => byId[id])
        .filter(Boolean);
      if (parents.length) {
        const below = { r: Math.max(...parents.map((p) => p.r)) + 1, c: Math.round(parents.reduce((n, p) => n + p.c, 0) / parents.length) };
        for (let step = 0; step < COLS && !cell; step++) {
          for (const col of [below.c + step, below.c - step]) {
            if (col < 0 || col > COLS - 1) continue;
            if (!occupied.has(`${below.r}:${col}`)) { cell = { r: below.r, c: col }; break; }
          }
        }
      }
    }
    if (!cell) {
      const [lo, hi] = colRange(c, split);
      cell = firstFreeCell(occupied, lo, hi);
    }
    occupied.add(cellKey(cell));
    byId[c.id] = cell;
    toPersist[c.id] = cell;
  });

  return { byId, toPersist };
}

export default function RelationshipMap({ show, seasonCast, currentSeason, episodeOptions, mapHelpOpen, onToggleHelp }: {
  show: Show; seasonCast: CastMember[]; currentSeason: number; episodeOptions: string[]; mapHelpOpen: boolean; onToggleHelp: () => void;
}) {
  const { updateData, settings, setMapZoom } = useStore();
  /**
   * Two refs, and the distinction matters. `viewportRef` is the fixed window you look through;
   * `containerRef` is the board itself, which at 2x is twice the size of that window and slides
   * behind it.
   *
   * Every coordinate in this file is a percentage of the *board*, so `containerRef` has to stay on
   * the board for `pctFromClient` to keep working. It does, unchanged, because a scaled element's
   * `getBoundingClientRect()` reports its on-screen size — the percentages come out right at
   * either zoom with no arithmetic added anywhere.
   */
  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  /**
   * Every finger currently on the board, so a second one can be noticed the moment it lands.
   *
   * A ref rather than state: these change on every move event and nothing renders from them
   * directly — putting them in state would re-render the whole board on each frame of a pinch.
   */
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  /** Finger separation when the pinch began, or null when fewer than two are down. */
  const pinchFrom = useRef<number | null>(null);
  const [dragMove, setDragMove] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragRelate, setDragRelate] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const [lineDrag, setLineDrag] = useState<{ sourceId: string; relId: string; end: 'source' | 'target'; x: number; y: number } | null>(null);

  /**
   * Scripted shows get kinship, reality shows keep the dating board.
   *
   * The two are different tools that happen to share a canvas: on a dating show a line is a
   * feeling that changes weekly, and on a scripted show it is a fact about a family that gets
   * revealed. Everything below that branches, branches here.
   */
  const kinship = show.type === 'DRAMA';
  /** A link drawn but not yet named — kinship has to be asked, it cannot be assumed. */
  const [pendingKind, setPendingKind] = useState<{ sourceId: string; targetId: string } | null>(null);

  const mapEpisode = show.mapEpisode || episodeOptions[0] || 'Ep 1';
  const epKey = epKeyFor(currentSeason, mapEpisode);
  const visibleCast = useMemo(() => seasonCast.filter((c) => !c.hideFromMap), [seasonCast]);
  const hiddenCast = useMemo(() => seasonCast.filter((c) => c.hideFromMap), [seasonCast]);

  const rows = ROWS;
  const { byId: cellById, toPersist } = useMemo(() => resolveCells(visibleCast, epKey, kinship), [visibleCast, epKey, kinship]);

  // Write newly claimed cells straight away. Until a position is saved it would be recomputed on
  // the next render, which is exactly the shuffling this replaces. Settles after one pass: once
  // persisted, toPersist comes back empty.
  useEffect(() => {
    const ids = Object.keys(toPersist);
    if (!ids.length) return;
    updateData((d) => {
      const sh = d.shows.find((x) => x.id === show.id);
      if (!sh) return;
      ids.forEach((id) => {
        const c = sh.cast.find((x) => x.id === id);
        if (c) c.mapCellByEp = { ...(c.mapCellByEp || {}), [epKey]: toPersist[id] };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toPersist, epKey, show.id]);

  const cellPct = (cell: MapCell) => ({
    x: COLS > 1 ? 8 + (cell.c / (COLS - 1)) * 84 : 50,
    y: rows > 1 ? 27.5 + (cell.r / (rows - 1)) * 45 : 50,
  });

  const posById = useMemo(() => {
    const m: Record<string, { x: number; y: number; cell: MapCell }> = {};
    visibleCast.forEach((c) => {
      const cell = cellById[c.id] || { r: DEFAULT_TOP_ROW, c: 0 };
      m[c.id] = { ...cellPct(cell), cell };
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCast, epKey, cellById, rows]);

  const containerH = Math.max(260, rows * 46 + 40) * 3;

  /**
   * Two sizes, not a free zoom. A pinch-zoom range means every session starts at whatever scale it
   * was left at and nothing is ever quite the same twice; two named sizes are a choice you can
   * make and remake in one tap, which is how the column controls elsewhere behave.
   */
  const zoom = settings.mapZoom === 2 ? 2 : 1;

  /** Kept inside the board's edges, so panning can never strand you on blank surface. */
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const el = viewportRef.current;
    if (!el || z <= 1) return { x: 0, y: 0 };
    return {
      x: Math.min(el.clientWidth * (z - 1), Math.max(0, p.x)),
      y: Math.min(el.clientHeight * (z - 1), Math.max(0, p.y)),
    };
  };

  // Going back to 1x has nowhere to pan to, and coming back to 2x should not resume half off-board.
  useEffect(() => { setPan((p) => clampPan(p, zoom)); }, [zoom]);

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };

  /**
   * Pinch to shrink, spread to enlarge — between the same two sizes, not a free zoom.
   *
   * The thresholds are deliberately far apart and asymmetric. A gesture has to change the
   * separation by a third before anything happens, so the small drift of two fingers that were
   * only meant to scroll never resizes the board; and once it fires the starting distance resets,
   * so a long gesture cannot chatter between sizes on its way.
   */
  const onPointerMoveViewport = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size !== 2 || pinchFrom.current === null) return;

    const ratio = spread() / pinchFrom.current;
    if (ratio > 1.33 && zoom !== 2) { setMapZoom(2); pinchFrom.current = spread(); }
    else if (ratio < 0.75 && zoom !== 1) { setMapZoom(1); pinchFrom.current = spread(); }
  };

  const releasePointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchFrom.current = null;
  };

  /**
   * The same gesture on a laptop. A trackpad pinch arrives as a wheel event with ctrlKey set —
   * that is how browsers have reported it for years — and ctrl+wheel on a mouse is the same
   * convention. Without this, removing the button would have left anyone without a touchscreen
   * no way to change the size at all.
   *
   * Registered by hand because it has to be non-passive: React attaches wheel listeners passively,
   * where preventDefault is ignored and the browser zooms the whole page instead.
   */
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return; // a plain wheel still scrolls the page past the map
      e.preventDefault();
      setMapZoom(e.deltaY < 0 ? 2 : 1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setMapZoom]);

  /**
   * One finger on the background moves the board.
   *
   * Nodes claim the same gesture — a drag from a face draws a relationship, a press-and-hold moves
   * it — and they call `stopPropagation`, so a press that starts on someone never reaches this.
   * The explicit check covers the rest of the furniture, the hearts especially, which delete on
   * click and would otherwise fire at the end of a pan.
   */
  const onViewportDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // The second finger turns whatever was happening into a pinch. Recording the separation here
    // is what makes the gesture relative to where it started rather than to some absolute size.
    if (pointers.current.size === 2) { pinchFrom.current = spread(); return; }
    if (zoom <= 1) return;
    if ((e.target as HTMLElement).closest('[data-node-id]')) return;
    const startX = e.clientX, startY = e.clientY;
    const from = pan;
    const onMove = (ev: PointerEvent) => {
      // A pan that a second finger has turned into a pinch must stop moving the board, or the
      // map slides away underneath the gesture that was only meant to resize it.
      if (pointers.current.size >= 2) return;
      setPan(clampPan({ x: from.x - (ev.clientX - startX), y: from.y - (ev.clientY - startY) }, zoom));
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const pctFromClient = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 50, y: 50 };
    const r = el.getBoundingClientRect();
    return { x: Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)), y: Math.min(100, Math.max(0, ((clientY - r.top) / r.height) * 100)) };
  };
  const nodeIdAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y);
    const nodeEl = el?.closest('[data-node-id]');
    return nodeEl ? nodeEl.getAttribute('data-node-id') : null;
  };

  const mutateCast = (fn: (c: CastMember) => void, castId: string) => {
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const c = s?.cast.find((x) => x.id === castId);
      if (c) fn(c);
    });
  };

  const setEpCell = (castId: string, cell: MapCell) => {
    mutateCast((c) => { c.mapCellByEp = { ...(c.mapCellByEp || {}), [epKey]: cell }; }, castId);
  };

  const createRelationship = (sourceId: string, targetId: string, kind: MapRelKind = 'interested') => {
    mutateCast((c) => {
      const list = getEpRel(c, epKey);
      c.relByEp = { ...(c.relByEp || {}), [epKey]: [...list, { id: genId('r'), targetId, label: REL_KINDS[kind].label, kind }] };
    }, sourceId);
  };

  /**
   * Record a kinship link, writing the reciprocal half for the symmetric kinds.
   *
   * Two halves rather than one, because the map reads relationships off whoever holds them and a
   * sibling recorded only on one side would vanish the moment that person was hidden. buildEdges
   * collapses the pair back into a single line, so the board looks the same either way.
   */
  const createKinship = (sourceId: string, targetId: string, kind: MapRelKind) => {
    createRelationship(sourceId, targetId, kind);
    if (REL_KINDS[kind].symmetric) createRelationship(targetId, sourceId, kind);
  };

  const deleteRelationship = (sourceId: string, relId: string) => {
    mutateCast((c) => {
      const list = getEpRel(c, epKey);
      c.relByEp = { ...(c.relByEp || {}), [epKey]: list.filter((r) => r.id !== relId) };
    }, sourceId);
  };

  /** Removes a line and every record behind it — both halves, when the pair was merged. */
  const deleteEdge = (e: { parts: { sourceId: string; relId: string }[] }) => {
    e.parts.forEach((part) => deleteRelationship(part.sourceId, part.relId));
  };

  const finishMove = (castId: string, clientX: number, clientY: number) => {
    const el = containerRef.current;
    setDragMove(null);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    let best: MapCell | null = null, bestDist = Infinity;
    for (let rr = -3; rr <= 10; rr++) {
      for (let cc = 0; cc < COLS; cc++) {
        const p = cellPct({ r: rr, c: cc });
        const cx = (p.x / 100) * r.width, cy = (p.y / 100) * r.height;
        const d = (cx - px) ** 2 + (cy - py) ** 2;
        if (d < bestDist) { bestDist = d; best = { r: rr, c: cc }; }
      }
    }
    if (!best) return;
    const occupant = visibleCast.find((c) => c.id !== castId && cellById[c.id]?.r === best!.r && cellById[c.id]?.c === best!.c);
    const mover = visibleCast.find((c) => c.id === castId);
    const moverOldCell = mover ? cellById[mover.id] : null;
    setEpCell(castId, best);
    if (occupant && moverOldCell) setEpCell(occupant.id, moverOldCell);
  };

  const onNodeDown = (id: string, e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX, startY = e.clientY;
    let decided: 'move' | 'relate' | null = null;
    const timer = setTimeout(() => {
      if (decided) return;
      decided = 'move';
      const p = pctFromClient(startX, startY);
      setDragMove({ id, x: p.x, y: p.y });
      if (navigator.vibrate) navigator.vibrate(12);
    }, 380);
    const onMove = (ev: PointerEvent) => {
      if (!decided) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) {
          decided = 'relate';
          clearTimeout(timer);
          const p = pctFromClient(ev.clientX, ev.clientY);
          setDragRelate({ sourceId: id, x: p.x, y: p.y });
        }
        return;
      }
      const p = pctFromClient(ev.clientX, ev.clientY);
      if (decided === 'relate') setDragRelate((s) => (s ? { ...s, x: p.x, y: p.y } : s));
      else setDragMove((s) => (s ? { ...s, x: p.x, y: p.y } : s));
    };
    const onUp = (ev: PointerEvent) => {
      clearTimeout(timer);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (decided === 'relate') {
        const targetId = nodeIdAtPoint(ev.clientX, ev.clientY);
        // Reality keeps its one meaning and needs no question. Kinship has to be named, and
        // guessing a default would fill family trees with whichever kind was cheapest to assume.
        if (targetId && targetId !== id) {
          if (kinship) setPendingKind({ sourceId: id, targetId });
          else createRelationship(id, targetId);
        }
        setDragRelate(null);
      } else if (decided === 'move') {
        finishMove(id, ev.clientX, ev.clientY);
      }
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const startLineEndDrag = (sourceId: string, relId: string, end: 'source' | 'target', e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    const p = pctFromClient(e.clientX, e.clientY);
    setLineDrag({ sourceId, relId, end, x: p.x, y: p.y });
    const onMove = (ev: PointerEvent) => { const q = pctFromClient(ev.clientX, ev.clientY); setLineDrag((s) => (s ? { ...s, x: q.x, y: q.y } : s)); };
    const onUp = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      const newNodeId = nodeIdAtPoint(ev.clientX, ev.clientY);
      finishLineEndDrag(sourceId, relId, end, newNodeId);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const finishLineEndDrag = (oldSourceId: string, relId: string, end: 'source' | 'target', newNodeId: string | null) => {
    setLineDrag(null);
    if (!newNodeId) { deleteRelationship(oldSourceId, relId); return; }
    const oldC = show.cast.find((x) => x.id === oldSourceId);
    const rel = oldC ? getEpRel(oldC, epKey).find((r) => r.id === relId) : null;
    if (!rel) return;
    if (end === 'target') {
      if (newNodeId === oldSourceId) return;
      mutateCast((c) => { c.relByEp = { ...(c.relByEp || {}), [epKey]: getEpRel(c, epKey).map((r) => (r.id === relId ? { ...r, targetId: newNodeId } : r)) }; }, oldSourceId);
    } else {
      if (newNodeId === rel.targetId || newNodeId === oldSourceId) return;
      deleteRelationship(oldSourceId, relId);
      mutateCast((c) => { c.relByEp = { ...(c.relByEp || {}), [epKey]: [...getEpRel(c, epKey), rel] }; }, newNodeId);
    }
  };

  /**
   * Every line for this episode, with reciprocal pairs already collapsed. See lib/relationshipEdges.
   *
   * `hearts` and `singleLines` are kept as names because the render below is written in them: a
   * mutual `interested` link is what draws a heart, and everything else is a line.
   */
  const edges = buildEdges(visibleCast, (c) => getEpRel(c, epKey));
  const hearts = edges.filter((e) => e.kind === 'interested' && e.mutual);
  const singleLines = edges.filter((e) => !(e.kind === 'interested' && e.mutual));

  const gapPct = 6;
  const shortenLine = (x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    return { x2: x2 - (dx / len) * gapPct, y2: y2 - (dy / len) * gapPct };
  };

  const importPrevLines = () => {
    const idx = episodeOptions.indexOf(mapEpisode);
    if (idx <= 0) return;
    const prevKey = epKeyFor(currentSeason, episodeOptions[idx - 1]);
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      s?.cast.forEach((c) => {
        const prevRel = c.relByEp?.[prevKey] || [];
        if (prevRel.length) c.relByEp = { ...(c.relByEp || {}), [epKey]: prevRel.map((r) => ({ ...r, id: genId('r') })) };
        const prevCell = c.mapCellByEp?.[prevKey];
        if (prevCell) c.mapCellByEp = { ...(c.mapCellByEp || {}), [epKey]: prevCell };
      });
    });
  };
  const resetLines = () => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); s?.cast.forEach((c) => { c.relByEp = { ...(c.relByEp || {}), [epKey]: [] }; }); });
  };
  const toggleHide = (castId: string) => mutateCast((c) => { c.hideFromMap = !c.hideFromMap; }, castId);

  const prevIdx = episodeOptions.indexOf(mapEpisode) - 1;
  const prevKey = prevIdx >= 0 ? epKeyFor(currentSeason, episodeOptions[prevIdx]) : null;
  const hasImportable = !!prevKey && show.cast.some((c) => (c.relByEp?.[prevKey!] || []).length > 0) && !show.cast.some((c) => (c.relByEp?.[epKey] || []).length > 0);
  const hasLines = show.cast.some((c) => (c.relByEp?.[epKey] || []).length > 0);

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>
          {kinship ? 'Who\u2019s related to who' : 'Relationship map'} for {mapEpisode}
        </div>
        <button onClick={onToggleHelp} aria-expanded={mapHelpOpen} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, fontWeight: 700, marginBottom: mapHelpOpen ? 6 : 8 }}>
          <span>How to use the map</span>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ transform: mapHelpOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }}><path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        {mapHelpOpen && (
          <ul style={{ margin: '0 0 8px', padding: '0 0 0 14px', fontSize: 14, color: 'var(--text-faint)', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {/* The gesture is identical in both modes; what it means is not, so the wording is the
                one thing that has to differ. */}
            {kinship ? (
              <li>Drag from one character to another to say how they&rsquo;re related — you pick which when you let go</li>
            ) : (
              <li>Drag from one contestant to another to show interest — the line starts at the person who&rsquo;s interested</li>
            )}
            <li>Press and hold {kinship ? 'a character' : 'a contestant'} to reposition them</li>
            <li>Tap the circles, or spread two fingers, to make the map bigger — pinch to fit it back on screen</li>
            {zoom > 1 && <li>Drag the background to move around the map</li>}
            <li>Drag a line's end to reconnect it, or drop it away from everyone to delete</li>
            {kinship && <li>Tap a line&rsquo;s label to remove it. What you record is per episode, so a reveal is just an edit on the episode where it happens</li>}
            <li>Tap the &times; on {kinship ? 'a character' : 'a contestant'} to take them off the map — they move to “Not shown on map” below, where you can add them back</li>
          </ul>
        )}
      </div>

      {/* Sticky, and a sibling of the board rather than a child of the heading block above it.
          A sticky element only sticks within its own parent's box, so left in that wrapper it
          would have unstuck the moment the title scrolled past — which is the whole length of the
          thing it is meant to stay above.

          `--ct-sticky-h` is the show screen's own sticky header, measured there and published for
          this. The header's height changes with content, so the offset cannot be a number: the
          episode rail grows a row when titles arrive, and a hardcoded top would leave this either
          overlapping the rail or floating below it. */}
      <div
        style={{
          position: 'sticky', top: 'var(--ct-sticky-h, 0px)', zIndex: 5,
          // Full-bleed, so the board scrolling underneath is covered edge to edge rather than
          // showing through the screen's 16px gutters.
          margin: '0 -16px', padding: '6px 16px 8px', background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 14, color: 'var(--text-faint)' }}>
          {/* A legend for the marks the board can actually make. On a scripted show there are no
              hearts to explain and the arrow means something else entirely — it points from the
              parent to the child, which is the one thing about a family tree worth stating. */}
          {kinship ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="16" height="8" viewBox="0 0 16 8"><line x1="1" y1="4" x2="11" y2="4" stroke={MAP_LINE} strokeWidth="1.5" /><path d="M11,1 L15,4 L11,7 Z" fill={MAP_LINE} /></svg><span>parent of</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="16" height="8" viewBox="0 0 16 8"><line x1="1" y1="4" x2="15" y2="4" stroke={MAP_LINE} strokeWidth="1.5" /></svg><span>sibling, partner, related</span></div>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="16" height="8" viewBox="0 0 16 8"><line x1="1" y1="4" x2="15" y2="4" stroke={MAP_LINE} strokeWidth="1.5" /></svg><span>interested in</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 13.6s-5.6-3.4-5.6-7.3C2.4 3.9 4.2 2.3 6.3 2.3c1.1 0 2.1.5 2.9 1.4.7-.9 1.7-1.4 2.8-1.4 2.1 0 3.9 1.6 3.9 4 0 3.9-5.6 7.3-5.6 7.3z" fill={MAP_HEART} /></svg><span>mutual</span></div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <MapSizeToggle value={zoom} onChange={setMapZoom} />
          {hasImportable && <button onClick={importPrevLines} style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--accent-soft)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Import from {episodeOptions[prevIdx]}</button>}
          {hasLines && (
            <>
              <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
              <button onClick={resetLines} style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: '1px solid transparent', borderRadius: 999, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset lines</button>
            </>
          )}
        </div>
      </div>
      <div
        ref={viewportRef}
        onPointerDown={onViewportDown}
        onPointerMove={onPointerMoveViewport}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onPointerLeave={releasePointer}
        style={{
          position: 'relative', width: '100%', height: containerH, border: '1px solid var(--border)',
          borderRadius: 16, background: 'var(--surface)', overflow: 'hidden',
          /* At the larger size the board takes the whole gesture, because one finger pans it.
             At the fitted size it gives vertical scrolling back to the page — the board is taller
             than the screen and being unable to scroll past it would be worse than any gesture —
             while still denying the browser its own pinch-zoom, which is what leaves the two
             fingers for this to read. */
          touchAction: zoom > 1 ? 'none' : 'pan-y',
          cursor: zoom > 1 ? 'grab' : undefined,
        }}
      >
      <div
        ref={containerRef}
        style={{
          position: 'absolute', inset: 0, transformOrigin: '0 0',
          transform: `translate(${-pan.x}px, ${-pan.y}px) scale(${zoom})`,
        }}
      >
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <defs>
            <marker id="relArrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill={MAP_LINE} /></marker>
          </defs>
          {Array.from({ length: 14 }).map((_, idx) => {
            const r = idx - 3;
            return Array.from({ length: COLS }).map((_, c) => {
              const p = cellPct({ r, c });
              return <circle key={`${r}-${c}`} cx={p.x} cy={p.y} r={1.2} fill="var(--text-faint)" opacity={0} />;
            });
          })}
          {singleLines.map((e) => {
            const a = posById[e.aId], b = posById[e.bId];
            if (!a || !b) return null;
            // A symmetric line has no "from", so it runs edge to edge with no arrowhead and is
            // shortened at both ends rather than one.
            const short = shortenLine(a.x, a.y, b.x, b.y);
            // shortenLine trims the far end, so running it backwards trims the near one.
            const back = shortenLine(b.x, b.y, a.x, a.y);
            const x1 = e.directed ? a.x : back.x2, y1 = e.directed ? a.y : back.y2;
            const drag = e.parts[0];
            return (
              <g key={e.key}>
                <line x1={x1} y1={y1} x2={short.x2} y2={short.y2} stroke="transparent" strokeWidth={4} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(ev) => startLineEndDrag(drag.sourceId, drag.relId, 'target', ev)} />
                <line x1={x1} y1={y1} x2={short.x2} y2={short.y2} stroke={MAP_LINE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" markerEnd={e.directed ? 'url(#relArrow)' : undefined} style={{ pointerEvents: 'none' }} />
                <circle cx={a.x} cy={a.y} r={2.4} fill={MAP_LINE} opacity={0.001} style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(ev) => startLineEndDrag(drag.sourceId, drag.relId, 'source', ev)} />
              </g>
            );
          })}
          {hearts.map((e) => {
            const a = posById[e.aId], b = posById[e.bId];
            if (!a || !b) return null;
            return <line key={e.key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MAP_HEART} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />;
          })}
          {lineDrag && (() => {
            const anchor = posById[lineDrag.end === 'target' ? lineDrag.sourceId : (show.cast.find((c) => c.id === lineDrag.sourceId)?.relByEp?.[epKey]?.find((r) => r.id === lineDrag.relId)?.targetId || '')];
            return anchor ? <line x1={anchor.x} y1={anchor.y} x2={lineDrag.x} y2={lineDrag.y} stroke="currentColor" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeDasharray="1,1.2" /> : null;
          })()}
          {dragRelate && posById[dragRelate.sourceId] && (
            <line x1={posById[dragRelate.sourceId].x} y1={posById[dragRelate.sourceId].y} x2={dragRelate.x} y2={dragRelate.y} stroke="currentColor" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeDasharray="2,2" />
          )}
        </svg>

        {hearts.map((e) => {
          const a = posById[e.aId], b = posById[e.bId];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <div key={e.key} onClick={() => deleteEdge(e)} style={{ position: 'absolute', left: `${mx}%`, top: `${my}%`, transform: 'translate(-50%, -50%)', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 3 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 13.6s-5.6-3.4-5.6-7.3C2.4 3.9 4.2 2.3 6.3 2.3c1.1 0 2.1.5 2.9 1.4.7-.9 1.7-1.4 2.8-1.4 2.1 0 3.9 1.6 3.9 4 0 3.9-5.6 7.3-5.6 7.3z" fill={MAP_HEART} /></svg>
            </div>
          );
        })}

        {/* Kinship lines carry their word at the midpoint. A family tree of unlabelled strokes
            says who is connected and not how, which is the only thing anyone opens it to learn.
            The label is also the delete target, the way the heart is on the dating board. */}
        {kinship && singleLines.map((e) => {
          const a = posById[e.aId], b = posById[e.bId];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <button
              key={`lbl-${e.key}`}
              onClick={() => deleteEdge(e)}
              aria-label={`${e.label} — remove`}
              style={{
                position: 'absolute', left: `${mx}%`, top: `${my}%`, transform: 'translate(-50%, -50%)',
                zIndex: 3, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 10, fontWeight: 700,
                padding: '2px 6px', borderRadius: 999, whiteSpace: 'nowrap',
                background: 'var(--sheet)', color: 'var(--text-muted)', boxShadow: 'var(--shadow-card)',
              }}
            >
              {e.label}
            </button>
          );
        })}

        {/* Naming the link, asked once at the moment it is drawn.

            A sheet would be too much furniture for a two-tap decision and would cover the board
            you are reading; a default would be worse, because whichever kind is cheapest to assume
            is the one every tree would silently fill with. So: four words, over the map, dismissible
            by choosing nothing. */}
        {pendingKind && (() => {
          const a = posById[pendingKind.sourceId], b = posById[pendingKind.targetId];
          const source = visibleCast.find((c) => c.id === pendingKind.sourceId);
          const target = visibleCast.find((c) => c.id === pendingKind.targetId);
          if (!a || !b || !source || !target) return null;
          return (
            <div
              role="dialog"
              aria-label={`How is ${source.name} related to ${target.name}?`}
              style={{
                position: 'absolute', left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%`,
                transform: 'translate(-50%, -50%)', zIndex: 6, background: 'var(--sheet)',
                borderRadius: 14, boxShadow: 'var(--shadow-lift)', padding: 10, width: 190,
              }}
            >
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: 8 }}>
                <strong style={{ color: 'var(--text)' }}>{source.name}</strong> is the&hellip;
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {KINSHIP_KINDS.map((k) => (
                  <button
                    key={k}
                    onClick={() => { createKinship(pendingKind.sourceId, pendingKind.targetId, k); setPendingKind(null); }}
                    style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {/* "Parent of" reads as a sentence with the name above it; the rest are nouns. */}
                    {k === 'parent' ? `parent of ${target.name.split(' ')[0]}` : REL_KINDS[k].label.toLowerCase()}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setPendingKind(null)}
                style={{ marginTop: 8, border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-faint)' }}
              >
                Cancel
              </button>
            </div>
          );
        })()}

        {visibleCast.map((c) => {
          const p = posById[c.id];
          if (!p) return null;
          const isDragging = dragMove?.id === c.id;
          const x = isDragging ? dragMove!.x : p.x;
          const y = isDragging ? dragMove!.y : p.y;
          return (
            /* The node box is the avatar and nothing else, with the name hung beneath it out of
               flow. Names wrap now, and if the label were still a flex child every extra line
               would make the box taller — and because the box is centred on the cell, a two-line
               name would push its face half a line off the point every relationship line is drawn
               to. This way one-line and two-line names sit identically. */
            <div key={c.id} data-node-id={c.id} onPointerDown={(e) => onNodeDown(c.id, e)} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none', zIndex: isDragging ? 5 : 2, cursor: 'grab', touchAction: 'none' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c.color, border: '2px solid var(--sheet)', boxShadow: '0 0 0 1px var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', fontSize: 13, ...bgStyle(c.photo, 'cover') }}>
                  {!c.photo && initials(c.name)}
                </div>
                <button onPointerDown={(e) => { e.stopPropagation(); toggleHide(c.id); }} aria-label="Remove from map" style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--text-muted)', fontSize: 12, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>&times;</button>
                {/* Wraps to two lines instead of ellipsising at one. At 60px and nowrap, "Shin
                    Ji-yeon" and "Kang So-yeon" both rendered as "Kang So…" — on a board whose
                    entire job is telling people apart, the label is the last thing that should
                    truncate. 76px is wider than the face and still inside the column spacing, so
                    neighbours cannot run into each other.

                    Two lines is a cap, not a target, and it is deliberate: left to wrap freely a
                    long name reaches a third line and lands on top of the row below, which is
                    worse than an ellipsis. Real cast names fit in two at this width; the ones that
                    don't are the ones you'd shorten by hand anyway. */}
                <div
                  style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
                    width: 76,
                    /* The board is scaled bodily, so a 12px label comes out at 24px once the
                       faces double — far larger than anything else on the screen and louder than
                       the photo it belongs to. Shrunk to 60% at the larger size it lands near
                       14px on screen: still comfortably readable, and back to captioning the face
                       rather than competing with it. A smaller label also wraps less, so more
                       names fit on one line at 2x than at 1x. */
                    fontSize: zoom > 1 ? 12 * 0.6 : 12,
                    fontWeight: 700, lineHeight: 1.2, color: 'var(--text)',
                    textAlign: 'center', overflowWrap: 'break-word',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}
                >
                  {c.name}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </div>

      {hiddenCast.length > 0 && (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Not shown on map:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hiddenCast.map((c) => <button key={c.id} onClick={() => toggleHide(c.id)} style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-soft)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer' }}>+ {c.name}</button>)}
          </div>
        </>
      )}
    </div>
  );
}
