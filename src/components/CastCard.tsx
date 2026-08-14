import { useState } from 'react';
import type { CastMember, Show } from '../types';
import { initials, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { useUI } from '../hooks/useUI';
import { episodeCountLabel, seasonRangeLabel, type CastMeta } from '../lib/showShape';

export default function CastCard({
  show,
  c,
  compact,
  meta,
  currentSeason,
}: {
  show: Show;
  c: CastMember;
  compact: boolean;
  meta?: CastMeta;
  currentSeason?: number;
}) {
  const { openCastDetail } = useUI();
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

      {/* The edit + share pair used to hang off this card's corner. Both actions live in the
          detail sheet, one tap away, and on a 4-column grid they sat on top of the face the
          card exists to show. ShowTile still uses CardActions — a show tile has no equivalent
          sheet to reach for. */}

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

      {/* TMDb-derived, so only present for cast imported from TMDb — hand-added characters have no
          actorTmdbId to join on and simply show nothing here rather than a zero.

          "new in S3" is the affordance for a cast that grows: it marks the characters who arrive
          in the season you're looking at, which is otherwise invisible in a grid that only gets
          longer. It needs firstSeason, which comes from the per-season lookup — absent on shows
          where that wasn't run, in which case the badge silently doesn't appear. */}
      {meta && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {episodeCountLabel(meta.episodeCount)}
            {meta.firstSeason && meta.lastSeason ? ` · ${seasonRangeLabel(meta.firstSeason, meta.lastSeason)}` : ''}
          </span>
          {currentSeason !== undefined && meta.firstSeason === currentSeason && (
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent-soft)', background: 'color-mix(in oklch, var(--accent-soft) 12%, transparent)', padding: '2px 6px', borderRadius: 999 }}>
              new in S{currentSeason}
            </span>
          )}
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
