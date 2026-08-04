import { useState } from 'react';
import type { CastMember, Show } from '../types';
import { initials, bgStyle } from '../lib/utils';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';

function EditIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.7 12l-2.9.7.7-2.9 7.8-7.5z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" fill="none"></path></svg>;
}
function ShareIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><path d="M5.6 7.2l4.6-3.2M5.6 8.8l4.6 3.2" stroke="#fff" strokeWidth="1.3" /></svg>;
}

export default function CastCard({ show, c, compact }: { show: Show; c: CastMember; compact: boolean }) {
  const { openCastDetail, openShareSheet, openEditCast } = useUI();
  const { shareCast } = useStore();
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const activeVersion = activeVersionId ? c.versions.find((v) => v.id === activeVersionId) : null;

  const displayName = activeVersion?.name || c.name;
  const displayNickname = activeVersion?.nickname || c.nickname;
  const displayDesc = activeVersion?.desc || c.desc;
  const displayPhoto = activeVersion?.photo || c.photo;

  return (
    <div className="ct-card" onClick={() => openCastDetail(c.id)}>
      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', backgroundColor: c.color, marginBottom: 10, ...bgStyle(displayPhoto, 'contain') }}>
        {!displayPhoto && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(displayName)}</div>
        )}
        <button onClick={(e) => { e.stopPropagation(); openEditCast(c.id); }} style={{ position: 'absolute', right: 39, top: 7, width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><EditIcon /></button>
        <button onClick={(e) => { e.stopPropagation(); openShareSheet(shareCast(show.id, c.id)); }} style={{ position: 'absolute', right: 7, top: 7, width: 26, height: 26, borderRadius: 999, background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ShareIcon /></button>
      </div>

      {c.versions.length > 0 && (
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', minWidth: 0, marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setActiveVersionId(null)} style={{ flex: 'none', height: 22, padding: '0 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: !activeVersionId ? 'none' : '1px solid var(--border)', background: !activeVersionId ? '#6366F1' : 'transparent', color: !activeVersionId ? '#fff' : 'var(--text-secondary)' }}>Present</button>
          {c.versions.map((v) => (
            <button key={v.id} onClick={() => setActiveVersionId(v.id)} style={{ flex: 'none', height: 22, padding: '0 9px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, cursor: 'pointer', border: activeVersionId === v.id ? 'none' : '1px solid var(--border)', background: activeVersionId === v.id ? '#6366F1' : 'transparent', color: activeVersionId === v.id ? '#fff' : 'var(--text-secondary)' }}>{v.age || v.name || 'Version'}</button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.005em' }}>{displayName}</div>
      {displayNickname && <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4 }}>&ldquo;{displayNickname}&rdquo;</div>}

      {compact ? (
        displayDesc && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayDesc}</div>
      ) : (
        displayDesc && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{displayDesc}</div>
      )}
    </div>
  );
}
