import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { unpackShow, unpackCast, type SharePacket } from '../lib/shareLink';
import { genId, colorForIndex, initials, bgStyle } from '../lib/utils';
import Sheet from './Sheet';

/**
 * What arrives when someone opens a share link.
 *
 * Shown before anything is written, because a link from a friend should not be able to change your
 * library by being clicked. It is also the only place the recipient learns what they are getting —
 * a fragment cannot be previewed by the messaging app that delivered it, by design, since a preview
 * would mean uploading the sender's notes to render a thumbnail.
 */
export default function ShareImportSheet({ packet, onDone }: { packet: SharePacket | null; onDone: () => void }) {
  const { updateData, data } = useStore();
  const { activeShowId, openShow } = useUI();

  if (!packet) return null;

  const isShow = packet.k === 'show';
  const count = packet.c.length;
  const title = isShow ? packet.t : (packet.c[0].n as string) || 'A character';
  const subtitle = isShow
    ? count === 0
      ? 'A show, with no characters written yet'
      : `A show, with ${count} ${count === 1 ? 'character' : 'characters'} someone wrote`
    : `A character from ${packet.st}`;

  /**
   * A character card needs somewhere to land, and only the recipient knows where. Landing it in
   * whatever show happens to be open is the one behaviour that could put someone's work in the
   * wrong place silently.
   */
  const targetShow = !isShow ? data.shows.find((s) => s.id === activeShowId) : undefined;
  const blocked = !isShow && !targetShow;

  const add = () => {
    if (isShow) {
      const id = genId('s');
      updateData((d) => {
        d.shows.push(unpackShow(packet, (i) => colorForIndex(d.shows.length + i), id));
      });
      onDone();
      openShow(id);
      return;
    }
    if (!targetShow) return;
    updateData((d) => {
      const s = d.shows.find((x) => x.id === targetShow.id);
      if (!s) return;
      s.cast.push(unpackCast(packet, colorForIndex(s.cast.length)));
    });
    onDone();
  };

  return (
    <Sheet onClose={onDone} label="Shared with you" sheetStyle={{ maxHeight: 'none', padding: '22px 18px 28px' }}>
      <div className="ct-sheet-title">Shared with you</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 18px' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, flex: 'none', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(isShow ? packet.p : null) }}>
          {(!isShow || !packet.p) && initials(title)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
      </div>

      {blocked ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          Open the show you want this character added to, then follow the link again — a character
          has to go somewhere, and only you know where.
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
          {isShow
            ? 'This becomes your own copy, yours to edit. Cast from TMDb loads on this device as you browse.'
            : `This will be added to ${targetShow?.title}.`}
        </div>
      )}

      {!blocked && (
        <button onClick={add} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 8 }}>
          Add to my library
        </button>
      )}
      <button onClick={onDone} className="ct-btn-ghost" style={{ width: '100%' }}>
        {blocked ? 'Close' : 'No thanks'}
      </button>
    </Sheet>
  );
}
