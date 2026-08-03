import type { Show } from '../types';
import { initials, bgStyle } from '../lib/utils';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';

function EditIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /></svg>;
}
function ShareIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><path d="M5.6 7.2l4.6-3.2M5.6 8.8l4.6 3.2" stroke="#fff" strokeWidth="1.3" /></svg>;
}

export function ShowTile({ show, columns, done = false }: { show: Show; columns: number; done?: boolean }) {
  const { openShow, openEditShow, openShareSheet } = useUI();
  const { shareShow } = useStore();
  const typeLabel = done ? 'DONE' : (columns >= 4 ? show.type.slice(0, 2) : show.type);
  const caughtUpVisible = !!show.caughtUpEp && (columns === 2 || columns === 3);

  return (
    <div style={{ textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }} onClick={() => openShow(show.id)}>
      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 18, overflow: 'hidden', backgroundColor: show.color, opacity: done ? 0.75 : 1, ...bgStyle(show.poster) }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, rgba(255,255,255,0.14), rgba(0,0,0,0.32))' }} />
        <span style={{ position: 'absolute', top: 10, left: 10, maxWidth: 'calc(100% - 74px)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.92)', background: 'rgba(0,0,0,0.28)', padding: '4px 8px', borderRadius: 999, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeLabel}</span>
        {!show.poster && <span style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 60, fontWeight: 800, color: 'rgba(255,255,255,0.16)', lineHeight: 0.7 }}>{initials(show.title)}</span>}
        <span style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 11, color: 'rgba(255,255,255,0.85)' }}>{show.cast.length} cast</span>
        {caughtUpVisible && (
          <span style={{ position: 'absolute', left: 10, bottom: 30, fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'rgba(99,102,241,0.85)', padding: '3px 7px', borderRadius: 999 }}>Caught up &middot; {show.caughtUpEp}</span>
        )}
        <button onClick={(e) => { e.stopPropagation(); openEditShow(show.id); }} style={{ position: 'absolute', right: 39, top: 7, width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><EditIcon /></button>
        <button onClick={(e) => { e.stopPropagation(); openShareSheet(shareShow(show.id)); }} style={{ position: 'absolute', right: 7, top: 7, width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ShareIcon /></button>
      </div>
      <div style={{ marginTop: 9, fontSize: 15, fontWeight: 700, lineHeight: 1.2 }}>{show.title}</div>
    </div>
  );
}

export function RecentShowTile({ show }: { show: Show }) {
  const { openShow } = useUI();
  return (
    <div onClick={() => openShow(show.id)} style={{ flex: 'none', width: 84, textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }}>
      <div style={{ position: 'relative', width: 84, height: 84, borderRadius: 16, overflow: 'hidden', backgroundColor: show.color, display: 'flex', alignItems: 'center', justifyContent: 'center', ...bgStyle(show.poster) }}>
        {!show.poster && <span style={{ fontSize: 26, fontWeight: 800, color: 'rgba(255,255,255,0.85)' }}>{initials(show.title)}</span>}
      </div>
      <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{show.title}</div>
    </div>
  );
}
