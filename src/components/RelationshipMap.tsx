import { useMemo, useRef, useState } from 'react';
import type { CastMember, MapCell, MapRelationship, Show } from '../types';
import { useStore } from '../hooks/useStore';
import { bgStyle, genId, initials } from '../lib/utils';

const COLS = 6;
const ROWS = 8;
const DEFAULT_TOP_ROW = -3; // anchor default layout near the top so images are visible without scrolling
const MAP_LINE = '#E85D9C';
const MAP_HEART = '#D2453B';

function epKeyFor(season: number, ep: string) { return `${season}_${ep}`; }
function getEpRel(c: CastMember, epKey: string): MapRelationship[] { return c.relByEp?.[epKey] || []; }
function getEpCell(c: CastMember, epKey: string): MapCell | null { return c.mapCellByEp?.[epKey] || null; }

function assignDefaultCells(cast: CastMember[]): Record<string, MapCell> {
  const out: Record<string, MapCell> = {};
  // Lay a list out evenly, spread across the column range [colMin, colMax] and vertically centered.
  const place = (list: CastMember[], colMin: number, colMax: number) => {
    const n = list.length;
    if (!n) return;
    const width = colMax - colMin;
    const numCols = Math.min(width + 1, n);
    list.forEach((m, i) => {
      const slotCol = i % numCols;
      const slotRow = Math.floor(i / numCols);
      const c = numCols > 1 ? colMin + Math.round((slotCol / (numCols - 1)) * width) : Math.round((colMin + colMax) / 2);
      const r = DEFAULT_TOP_ROW + slotRow; // stack downward from the top
      out[m.id] = { r, c };
    });
  };
  const female = cast.filter((c) => c.gender === 'Female');
  const male = cast.filter((c) => c.gender === 'Male');
  const other = cast.filter((c) => c.gender !== 'Female' && c.gender !== 'Male');
  if (female.length && male.length) {
    // Dating-show style: women on the left, men on the right, everyone else centered
    place(female, 0, 2);
    place(other, 3, 3);
    place(male, 4, COLS - 1);
  } else {
    // No clear gender split — one even, orderly grid across the whole map
    place(cast, 0, COLS - 1);
  }
  return out;
}

export default function RelationshipMap({ show, seasonCast, currentSeason, episodeOptions, mapHelpOpen, onToggleHelp }: {
  show: Show; seasonCast: CastMember[]; currentSeason: number; episodeOptions: string[]; mapHelpOpen: boolean; onToggleHelp: () => void;
}) {
  const { updateData } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragMove, setDragMove] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dragRelate, setDragRelate] = useState<{ sourceId: string; x: number; y: number } | null>(null);
  const [lineDrag, setLineDrag] = useState<{ sourceId: string; relId: string; end: 'source' | 'target'; x: number; y: number } | null>(null);

  const mapEpisode = show.mapEpisode || episodeOptions[0] || 'Ep 1';
  const epKey = epKeyFor(currentSeason, mapEpisode);
  const visibleCast = useMemo(() => seasonCast.filter((c) => !c.hideFromMap), [seasonCast]);
  const hiddenCast = useMemo(() => seasonCast.filter((c) => c.hideFromMap), [seasonCast]);

  const rows = ROWS;
  const defaultCells = useMemo(() => assignDefaultCells(visibleCast), [visibleCast]);

  const cellPct = (cell: MapCell) => ({
    x: COLS > 1 ? 8 + (cell.c / (COLS - 1)) * 84 : 50,
    y: rows > 1 ? 27.5 + (cell.r / (rows - 1)) * 45 : 50,
  });

  const posById = useMemo(() => {
    const m: Record<string, { x: number; y: number; cell: MapCell }> = {};
    visibleCast.forEach((c) => {
      const cell = getEpCell(c, epKey) || defaultCells[c.id] || { r: 0, c: 0 };
      m[c.id] = { ...cellPct(cell), cell };
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleCast, epKey, defaultCells, rows]);

  const containerH = Math.max(260, rows * 46 + 40) * 3;

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

  const createRelationship = (sourceId: string, targetId: string) => {
    mutateCast((c) => {
      const list = getEpRel(c, epKey);
      c.relByEp = { ...(c.relByEp || {}), [epKey]: [...list, { id: genId('r'), targetId, label: 'Interested', kind: 'interested' }] };
    }, sourceId);
  };

  const deleteRelationship = (sourceId: string, relId: string) => {
    mutateCast((c) => {
      const list = getEpRel(c, epKey);
      c.relByEp = { ...(c.relByEp || {}), [epKey]: list.filter((r) => r.id !== relId) };
    }, sourceId);
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
    const occupant = visibleCast.find((c) => c.id !== castId && (getEpCell(c, epKey) || defaultCells[c.id])?.r === best!.r && (getEpCell(c, epKey) || defaultCells[c.id])?.c === best!.c);
    const mover = visibleCast.find((c) => c.id === castId);
    const moverOldCell = mover ? (getEpCell(mover, epKey) || defaultCells[mover.id]) : null;
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
        if (targetId && targetId !== id) createRelationship(id, targetId);
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

  // Build line list, merging reciprocal pairs into hearts
  const allRels: { sourceId: string; rel: MapRelationship }[] = [];
  visibleCast.forEach((c) => getEpRel(c, epKey).forEach((rel) => allRels.push({ sourceId: c.id, rel })));
  const consumed = new Set<string>();
  const singleLines: { sourceId: string; rel: MapRelationship }[] = [];
  const hearts: { aId: string; bId: string; relIds: [string, string] }[] = [];
  allRels.forEach(({ sourceId, rel }) => {
    if (consumed.has(rel.id)) return;
    const reciprocal = allRels.find((o) => o.sourceId === rel.targetId && o.rel.targetId === sourceId && !consumed.has(o.rel.id));
    if (reciprocal) {
      consumed.add(rel.id); consumed.add(reciprocal.rel.id);
      hearts.push({ aId: sourceId, bId: rel.targetId, relIds: [rel.id, reciprocal.rel.id] });
    } else {
      singleLines.push({ sourceId, rel });
    }
  });

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>Relationship map for {mapEpisode}</div>
          <button onClick={onToggleHelp} aria-label="Toggle instructions" style={{ width: 16, height: 16, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, lineHeight: 1, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
        </div>
        {mapHelpOpen && (
          <ul style={{ margin: '0 0 8px', padding: '0 0 0 14px', fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.4, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <li>Drag from one contestant to another to show interest — the line starts at the person who's interested</li>
            <li>Press and hold a contestant to reposition them</li>
            <li>Drag a line's end to reconnect it, or drop it away from everyone to delete</li>
          </ul>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-faint)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="16" height="8" viewBox="0 0 16 8"><line x1="1" y1="4" x2="15" y2="4" stroke={MAP_LINE} strokeWidth="1.5" /></svg><span>interested in</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 13.6s-5.6-3.4-5.6-7.3C2.4 3.9 4.2 2.3 6.3 2.3c1.1 0 2.1.5 2.9 1.4.7-.9 1.7-1.4 2.8-1.4 2.1 0 3.9 1.6 3.9 4 0 3.9-5.6 7.3-5.6 7.3z" fill={MAP_HEART} /></svg><span>mutual</span></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            {hasImportable && <button onClick={importPrevLines} style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-soft)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Import from {episodeOptions[prevIdx]}</button>}
            {hasLines && (
              <>
                <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
                <button onClick={resetLines} style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', background: 'none', border: '1px solid transparent', borderRadius: 999, padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Reset lines</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: containerH, border: '1px solid var(--border)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
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
          {singleLines.map(({ sourceId, rel }) => {
            const a = posById[sourceId], b = posById[rel.targetId];
            if (!a || !b) return null;
            const short = shortenLine(a.x, a.y, b.x, b.y);
            return (
              <g key={rel.id}>
                <line x1={a.x} y1={a.y} x2={short.x2} y2={short.y2} stroke="transparent" strokeWidth={4} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(e) => startLineEndDrag(sourceId, rel.id, 'target', e)} />
                <line x1={a.x} y1={a.y} x2={short.x2} y2={short.y2} stroke={MAP_LINE} strokeWidth={1.5} vectorEffect="non-scaling-stroke" markerEnd="url(#relArrow)" style={{ pointerEvents: 'none' }} />
                <circle cx={a.x} cy={a.y} r={2.4} fill={MAP_LINE} opacity={0.001} style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={(e) => startLineEndDrag(sourceId, rel.id, 'source', e)} />
              </g>
            );
          })}
          {hearts.map((h) => {
            const a = posById[h.aId], b = posById[h.bId];
            if (!a || !b) return null;
            return <line key={h.relIds[0]} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={MAP_HEART} strokeWidth={1.5} vectorEffect="non-scaling-stroke" style={{ pointerEvents: 'none' }} />;
          })}
          {lineDrag && (() => {
            const anchor = posById[lineDrag.end === 'target' ? lineDrag.sourceId : (show.cast.find((c) => c.id === lineDrag.sourceId)?.relByEp?.[epKey]?.find((r) => r.id === lineDrag.relId)?.targetId || '')];
            return anchor ? <line x1={anchor.x} y1={anchor.y} x2={lineDrag.x} y2={lineDrag.y} stroke="#6366F1" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeDasharray="1,1.2" /> : null;
          })()}
          {dragRelate && posById[dragRelate.sourceId] && (
            <line x1={posById[dragRelate.sourceId].x} y1={posById[dragRelate.sourceId].y} x2={dragRelate.x} y2={dragRelate.y} stroke="#6366F1" strokeWidth={0.4} vectorEffect="non-scaling-stroke" strokeDasharray="2,2" />
          )}
        </svg>

        {hearts.map((h) => {
          const a = posById[h.aId], b = posById[h.bId];
          if (!a || !b) return null;
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          return (
            <div key={h.relIds[0]} onClick={() => { deleteRelationship(h.aId, h.relIds[0]); deleteRelationship(h.bId, h.relIds[1]); }} style={{ position: 'absolute', left: `${mx}%`, top: `${my}%`, transform: 'translate(-50%, -50%)', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 3 }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 13.6s-5.6-3.4-5.6-7.3C2.4 3.9 4.2 2.3 6.3 2.3c1.1 0 2.1.5 2.9 1.4.7-.9 1.7-1.4 2.8-1.4 2.1 0 3.9 1.6 3.9 4 0 3.9-5.6 7.3-5.6 7.3z" fill={MAP_HEART} /></svg>
            </div>
          );
        })}

        {visibleCast.map((c) => {
          const p = posById[c.id];
          if (!p) return null;
          const isDragging = dragMove?.id === c.id;
          const x = isDragging ? dragMove!.x : p.x;
          const y = isDragging ? dragMove!.y : p.y;
          return (
            <div key={c.id} data-node-id={c.id} onPointerDown={(e) => onNodeDown(c.id, e)} style={{ position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none', zIndex: isDragging ? 5 : 2, cursor: 'grab', touchAction: 'none' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c.color, border: '2px solid var(--sheet)', boxShadow: '0 0 0 1px var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', fontSize: 13, ...bgStyle(c.photo, 'cover') }}>
                  {!c.photo && initials(c.name)}
                </div>
                <button onPointerDown={(e) => { e.stopPropagation(); toggleHide(c.id); }} aria-label="Remove from map" style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--sheet)', color: 'var(--text-muted)', fontSize: 10, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>&times;</button>
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{c.name}</div>
            </div>
          );
        })}
      </div>

      {hiddenCast.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Not shown on map:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {hiddenCast.map((c) => <button key={c.id} onClick={() => toggleHide(c.id)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accent-soft)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer' }}>+ {c.name}</button>)}
          </div>
        </>
      )}
    </div>
  );
}
