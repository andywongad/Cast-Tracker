import { useState } from 'react';
import type { CastMember, Show } from '../types';
import { initials, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { useUI } from '../hooks/useUI';

export default function CastCard({
  show,
  c,
  compact,
}: {
  show: Show;
  c: CastMember;
  compact: boolean;
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

      {/* overflowWrap: anywhere so a long unbroken name breaks instead of running past the card.
          At four columns the text box is 99px wide; "Wolfeschlegelsteinhausenbergerdorff" measures
          265px and has no space to wrap at. Normal names still break on spaces as before — this
          only engages when there's no other option.

          The card and its grid row grow to whatever the name needs; nothing is clamped or
          ellipsised, so a four-line name gets four lines and its row gets taller. */}
      <div className="ct-heading" style={{ fontSize: 15, lineHeight: 1.25, overflowWrap: 'anywhere' }}>{displayName}</div>
      {displayNickname && <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4, overflowWrap: 'anywhere' }}>&ldquo;{displayNickname}&rdquo;</div>}
      {displayOtherNames.length > 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 700 }}>AKA</span> {displayOtherNames.join(', ')}
        </div>
      )}
      {/* "Who they are" fills the line a nickname or AKA would have taken, when neither exists.
          A card with only a name says nothing you couldn't get from the photo; "Meadow's boyfriend"
          is the thing you opened the app to remember. Not shown alongside them — three identity
          lines under one name is more than a card at four columns can carry. */}
      {!displayNickname && displayOtherNames.length === 0 && c.whoTheyAre && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.whoTheyAre}
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
