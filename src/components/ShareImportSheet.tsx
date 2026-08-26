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
  const { openShow } = useUI();

  if (!packet) return null;

  const isShow = packet.k === 'show';
  const count = packet.c.length;
  const title = isShow ? packet.t : (packet.c[0].n as string) || 'A character';
  const subtitle = isShow
    ? count === 0
      ? 'A show, with no characters written yet'
      : `A show, with ${count} ${count === 1 ? 'character' : 'characters'} someone wrote`
    : `A character from ${packet.st}`;

  const first = packet.c[0] as Record<string, unknown>;
  const preview = isShow
    ? packet.p
    : typeof first.pho === 'string'
      ? first.pho
      : typeof first.tmb === 'string'
        ? `https://image.tmdb.org/t/p/w185${first.tmb}`
        : null;

  const addShow = () => {
    if (packet.k !== 'show') return;
    const id = genId('s');
    updateData((d) => {
      d.shows.push(unpackShow(packet, (i) => colorForIndex(d.shows.length + i), id));
    });
    onDone();
    openShow(id);
  };

  const addCastTo = (showId: string) => {
    if (packet.k !== 'cast') return;
    updateData((d) => {
      const s = d.shows.find((x) => x.id === showId);
      if (!s) return;
      s.cast.push(unpackCast(packet, colorForIndex(s.cast.length)));
    });
    onDone();
    openShow(showId);
  };

  /**
   * Creates the show the character came from, then puts them in it.
   *
   * The character travels with its source show's title and TMDb id, so the shell this makes is a
   * real show — episodes and the rest of the cast load into it from TMDb like any other.
   */
  const addCastToNewShow = () => {
    if (packet.k !== 'cast') return;
    const id = genId('s');
    updateData((d) => {
      d.shows.push({
        id, title: packet.st, type: 'DRAMA', color: colorForIndex(d.shows.length), status: 'watching',
        cast: [unpackCast(packet, colorForIndex(0))],
        poster: null, tmdbId: packet.si ?? null, originCountry: '', wikiUrl: '', imdbUrl: '',
      });
    });
    onDone();
    openShow(id);
  };

  /**
   * Where a character can land, best guess first.
   *
   * The first version of this required a show to already be open and refused otherwise — which
   * meant it refused always, since a share link opens at the home screen and following it again
   * lands there again. A character does need a destination, but asking is the way to get one; the
   * app knows which show it came from and can usually pick it out of the recipient's library.
   */
  const matchIndex = !isShow
    ? data.shows.findIndex((s) => (packet.si && s.tmdbId === packet.si) || s.title === packet.st)
    : -1;
  const matched = matchIndex >= 0 ? data.shows[matchIndex] : undefined;
  const others = data.shows.filter((s) => s.id !== matched?.id);

  /**
   * Whether a show already holds this character — by actor id where there is one, by name where
   * there isn't. Same principle as the duplicate-show handling: the app doesn't refuse, it says so,
   * because two of someone is occasionally what you want and always worth knowing about first.
   */
  const alreadyHas = (showId: string): boolean => {
    if (isShow) return false;
    const target = data.shows.find((s) => s.id === showId);
    if (!target) return false;
    const actor = typeof first.a === 'number' ? first.a : null;
    const name = (first.n as string) || '';
    return target.cast.some((c) => (actor && c.actorTmdbId === actor) || (!!name && c.name === name));
  };

  const Row = ({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) => (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%',
        border: 'none', background: 'none', padding: '13px 2px', cursor: 'pointer', textAlign: 'left',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 15, color: 'var(--text)' }}>{label}</span>
      {hint && <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  );

  return (
    <Sheet onClose={onDone} label="Shared with you" sheetStyle={{ maxHeight: 'none', padding: '22px 18px 28px' }}>
      <div className="ct-sheet-title">Shared with you</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 18px' }}>
        {/* TMDb photos travel as a bare path, so the preview has to rebuild the URL the same way
            the unpacker does — reading `pho` alone showed initials for the very characters that do
            have a face. */}
        <div style={{ width: 48, height: 48, borderRadius: 12, flex: 'none', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(preview) }}>
          {!preview && initials(title)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{subtitle}</div>
        </div>
      </div>

      {isShow ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>
            This becomes your own copy, yours to edit. Cast from TMDb loads on this device as you browse.
          </div>
          <button onClick={addShow} className="ct-btn-primary ct-btn-primary-calm" style={{ width: '100%', marginBottom: 8 }}>
            Add to my library
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 6 }}>
            Which show should this character go in?
          </div>
          <div style={{ marginBottom: 14 }}>
            {matched && (
              <Row
                label={`Add to ${matched.title}`}
                hint={alreadyHas(matched.id)
                  ? `${matched.title} already has them — this adds a second copy`
                  : 'The show they came from, already in your library'}
                onClick={() => addCastTo(matched.id)}
              />
            )}
            <Row
              label={matched ? `Start a separate “${packet.st}”` : `Add to a new “${packet.st}”`}
              hint={matched ? 'A second copy of the show, with only this character in it' : 'Creates the show, with this character in it'}
              onClick={addCastToNewShow}
            />
            {others.map((s) => (
              <Row
                key={s.id}
                label={`Add to ${s.title}`}
                hint={alreadyHas(s.id) ? 'Already has them — this adds a second copy' : undefined}
                onClick={() => addCastTo(s.id)}
              />
            ))}
          </div>
        </>
      )}

      <button onClick={onDone} className="ct-btn-ghost" style={{ width: '100%' }}>No thanks</button>
    </Sheet>
  );
}
