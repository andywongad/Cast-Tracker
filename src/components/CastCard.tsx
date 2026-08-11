import { useState } from 'react';
import type { CastMember, Show } from '../types';
import { initials, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import CardActions from './CardActions';

export default function CastCard({ show, c, compact }: { show: Show; c: CastMember; compact: boolean }) {
  const { openCastDetail, openShareSheet, openEditCast } = useUI();
  const { shareCast } = useStore();
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const activeVersion = activeVersionId ? c.versions.find((v) => v.id === activeVersionId) : null;

  const displayName = activeVersion?.name || c.name;
  const displayNickname = activeVersion?.nickname || c.nickname;
  const displayDesc = activeVersion?.desc || c.desc;
  // Versions carry their own uploaded photo and always win; otherwise character still > actor headshot.
  const shownPhoto = activeVersion?.photo || displayPhoto(c);
  const displayOtherNames = (c.otherNames || []).filter(Boolean);

  return (
    <div className="ct-card" onClick={() => openCastDetail(c.id)}>
      <div style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', backgroundColor: 'var(--surface)', marginBottom: 10, ...cropStyle(shownPhoto, activeVersion ? null : c.photoCrop) }}>
        {!shownPhoto && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(displayName)}</div>
        )}
      </div>

      <CardActions onEdit={() => openEditCast(c.id)} onShare={() => openShareSheet(shareCast(show.id, c.id))} />

      {c.versions.length > 0 && (
        <div style={{ display: 'flex', gap: 5, overflowX: 'auto', minWidth: 0, marginBottom: 8 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => setActiveVersionId(null)} style={{ flex: 'none', height: 22, padding: '0 9px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: !activeVersionId ? 'none' : '1px solid var(--border)', background: !activeVersionId ? 'var(--accent)' : 'transparent', color: !activeVersionId ? '#fff' : 'var(--text-secondary)' }}>Present</button>
          {c.versions.map((v) => (
            <button key={v.id} onClick={() => setActiveVersionId(v.id)} style={{ flex: 'none', height: 22, padding: '0 9px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: activeVersionId === v.id ? 'none' : '1px solid var(--border)', background: activeVersionId === v.id ? 'var(--accent)' : 'transparent', color: activeVersionId === v.id ? '#fff' : 'var(--text-secondary)' }}>{v.age || v.name || 'Version'}</button>
          ))}
        </div>
      )}

      <div className="ct-heading" style={{ fontSize: 15, lineHeight: 1.25 }}>{displayName}</div>
      {displayNickname && <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4 }}>&ldquo;{displayNickname}&rdquo;</div>}
      {displayOtherNames.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700 }}>AKA</span> {displayOtherNames.join(', ')}
        </div>
      )}

      {compact ? (
        displayDesc && <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.4, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayDesc}</div>
      ) : (
        displayDesc && <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 6, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{displayDesc}</div>
      )}
    </div>
  );
}
