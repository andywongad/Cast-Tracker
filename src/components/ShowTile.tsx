import type { Show } from '../types';
import { initials, bgStyle } from '../lib/utils';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import CardActions from './CardActions';

export function ShowTile({ show, columns, done = false }: { show: Show; columns: number; done?: boolean }) {
  const { openShow, openEditShow, openShareSheet } = useUI();
  const { shareShow } = useStore();
  const typeLabel = done ? 'DONE' : (columns >= 4 ? show.type.slice(0, 2) : show.type);
  const caughtUpVisible = !!show.caughtUpEp && (columns === 2 || columns === 3);

  return (
    <div style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', color: 'var(--text)' }} onClick={() => openShow(show.id)}>
      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 18, overflow: 'hidden', backgroundColor: show.color, opacity: done ? 0.75 : 1, ...bgStyle(show.poster) }}>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, rgba(255,255,255,0.14), rgba(0,0,0,0.32))' }} />
        <span style={{ position: 'absolute', top: 10, left: 10, maxWidth: 'calc(100% - 74px)', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.92)', background: 'rgba(0,0,0,0.28)', padding: '4px 8px', borderRadius: 999, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{typeLabel}</span>
        {!show.poster && <span style={{ position: 'absolute', right: 8, bottom: 6, fontSize: 60, fontWeight: 800, color: 'rgba(255,255,255,0.16)', lineHeight: 0.7 }}>{initials(show.title)}</span>}
        <span style={{ position: 'absolute', left: 10, bottom: 10, fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 8px', borderRadius: 999, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}>{show.cast.length} cast</span>
        {caughtUpVisible && (
          <span style={{ position: 'absolute', left: 10, bottom: 30, fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'var(--text-muted)', padding: '3px 7px', borderRadius: 999 }}>Caught up &middot; {show.caughtUpEp}</span>
        )}
      </div>
      <CardActions onEdit={() => openEditShow(show.id)} onShare={() => openShareSheet(shareShow(show.id))} />
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
