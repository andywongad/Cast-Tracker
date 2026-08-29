import { useUI } from '../hooks/useUI';
import { useStore } from '../hooks/useStore';
import { initials, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { hasUserContent } from '../lib/castValue';
import type { CastMember } from '../types';
import Sheet from './Sheet';

/**
 * Everyone in one show that the user has written something about.
 *
 * Opened from the count on a show tile, which until now was a number you could read and not act
 * on. The number and this list are derived from the same predicate — `hasUserContent` — so the
 * badge cannot say eight and the list show seven.
 *
 * Reachable from the home screen, where no show is active, which is why the layer carries its own
 * showId and why tapping a row goes through `openCastDetailInShow` rather than `openCastDetail`:
 * the character sheet reads `activeShowId`, and from here there isn't one yet.
 */

/**
 * The one line worth showing under a name.
 *
 * Ordered by how deliberate the writing is. `whoTheyAre` is the user's own answer to "who is
 * this?" and is the reason most of these records exist; a nickname is a decision too. `desc` and
 * `notes` are further down because they are longer and were written to be read on the character's
 * own sheet, not in a list — they are here so that a record whose only content is a note still
 * says something rather than showing a bare name.
 *
 * Returns '' when the content is of a kind that has no sentence in it — a reframed photo, a
 * relationship, a hidden-from-map flag. Those are real work and belong in the list; they just
 * have nothing to quote.
 */
function summarise(c: CastMember): string {
  const first = (s: string) => s.trim().split('\n')[0].trim();
  if (c.whoTheyAre?.trim()) return first(c.whoTheyAre);
  if (c.nickname?.trim()) return `“${first(c.nickname)}”`;
  if (c.desc?.trim()) return first(c.desc);
  if (c.notes?.trim()) return first(c.notes);
  if (c.relationships?.length) {
    return `${c.relationships.length} ${c.relationships.length === 1 ? 'relationship' : 'relationships'}`;
  }
  return '';
}

export default function NotedSheet() {
  const { notedShowId, closeNoted, openCastDetailInShow } = useUI();
  const { showById } = useStore();
  const show = notedShowId ? showById(notedShowId) : null;

  if (!notedShowId || !show) return null;

  const noted = show.cast.filter(hasUserContent);

  return (
    <Sheet onClose={closeNoted} label={`Characters you've noted in ${show.title}`}>
      <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>
        Your notes
      </div>
      <h2 className="ct-heading" style={{ fontSize: 20, margin: '0 0 4px', fontWeight: 500 }}>{show.title}</h2>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
        {noted.length} of {show.cast.length} {show.cast.length === 1 ? 'character' : 'characters'} {noted.length === 1 ? 'has' : 'have'} something you wrote
      </div>

      {/* The badge is hidden at zero, so this should be unreachable — but a record can lose its
          last piece of content between the tile rendering and this opening, and an empty sheet
          with no explanation reads as a bug. */}
      {noted.length === 0 ? (
        <p style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--text-faint)', margin: 0 }}>
          Nothing written down for this show yet.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {noted.map((c) => {
            const photo = displayPhoto(c);
            const line = summarise(c);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openCastDetailInShow(show.id, c.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', padding: '8px 4px', borderRadius: 12,
                    cursor: 'pointer', color: 'var(--text)',
                  }}
                >
                  <div
                    style={{
                      flex: 'none', width: 42, height: 42, borderRadius: 12, overflow: 'hidden',
                      backgroundColor: 'var(--surface)', position: 'relative',
                      ...cropStyle(photo, c.photoCrop),
                    }}
                  >
                    {!photo && (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'var(--initials-tint)' }}>
                        {initials(c.name)}
                      </div>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{c.name}</div>
                    {line && (
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.35, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {line}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button onClick={closeNoted} className="ct-btn-ghost" style={{ width: '100%', marginTop: 18 }}>Done</button>
    </Sheet>
  );
}
