import { useEffect, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { searchShows, hasTmdbKey, img, inferShowType, type TmdbShowResult } from '../lib/tmdb';
import { bgStyle, posterStyle, colorForIndex, genId, SHOW_TYPE_LABELS } from '../lib/utils';
import type { PhotoCrop, ShowType } from '../types';
import CropModal from './CropModal';
import Sheet from './Sheet';

/**
 * The shape a poster is framed against.
 *
 * Matches the aspect of the show tile, which is the surface this framing exists to fix — a crop
 * adjusted in a square window and then rendered on a 4:5 tile would not be the thing the user
 * approved. Keep in step with ShowTile's aspectRatio.
 */
const TILE_ASPECT = 4 / 5;

interface FormState {
  title: string;
  type: ShowType;
  poster: string | null;
  posterCrop: PhotoCrop | null;
  tmdbId: number | null;
  originCountry: string;
  wikiUrl: string;
  imdbUrl: string;
}

/** VARIETY is legacy — see src/types.ts. It's never offered as a choice. */
const TYPES: ShowType[] = ['DRAMA', 'REALITY'];

function blank(): FormState {
  return { title: '', type: 'DRAMA', poster: null, posterCrop: null, tmdbId: null, originCountry: '', wikiUrl: '', imdbUrl: '' };
}

export default function AddShowSheet() {
  const { data, updateData } = useStore();
  const { addShowSheet, addShowPrefill, closeAddShow, openShow } = useUI();
  const [form, setForm] = useState<FormState>(blank());
  const [results, setResults] = useState<TmdbShowResult[]>([]);
  const [cropping, setCropping] = useState(false);
  const [searching, setSearching] = useState(false);

  const editingShow = addShowSheet.editingId ? data.shows.find((s) => s.id === addShowSheet.editingId) : null;

  useEffect(() => {
    if (!addShowSheet.open) return;
    if (editingShow) {
      setForm({
        title: editingShow.title, type: editingShow.type, poster: editingShow.poster || null,
        posterCrop: editingShow.posterCrop ?? null,
        tmdbId: editingShow.tmdbId || null, originCountry: editingShow.originCountry || '',
        wikiUrl: editingShow.wikiUrl || '', imdbUrl: editingShow.imdbUrl || '',
      });
    } else if (addShowPrefill) {
      setForm({ ...blank(), title: addShowPrefill.title, type: addShowPrefill.type || 'DRAMA', poster: addShowPrefill.poster || null, tmdbId: addShowPrefill.tmdbId || null, originCountry: addShowPrefill.originCountry || '' });
    } else {
      setForm(blank());
    }
    setResults([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    setCropping(false);
  }, [addShowSheet.open, addShowSheet.editingId]);

  useEffect(() => {
    if (!addShowSheet.open || !hasTmdbKey() || form.tmdbId) { setResults([]); return; }
    if (!form.title.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchShows(form.title).then((r) => { setResults(r); setSearching(false); }).catch(() => setSearching(false));
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.title, addShowSheet.open]);

  if (!addShowSheet.open) return null;

  const pickTmdb = (r: TmdbShowResult) => {
    // A new poster invalidates the old framing — it was measured against a different image.
    setForm((f) => ({ ...f, title: r.name, type: inferShowType(r.genre_ids), tmdbId: r.id, poster: img(r.poster_path), posterCrop: null, originCountry: r.origin_country?.[0] || '' }));
    setResults([]);
  };

  const save = () => {
    if (!form.title.trim()) return;
    if (editingShow) {
      updateData((d) => {
        const s = d.shows.find((x) => x.id === editingShow.id);
        if (!s) return;
        Object.assign(s, { title: form.title.trim(), type: form.type, poster: form.poster, posterCrop: form.posterCrop, tmdbId: form.tmdbId, originCountry: form.originCountry || s.originCountry, wikiUrl: form.wikiUrl, imdbUrl: form.imdbUrl });
      });
      closeAddShow();
      return;
    }
    const id = genId('s');
    updateData((d) => {
      d.shows.push({
        id, title: form.title.trim(), type: form.type, color: colorForIndex(d.shows.length), status: 'watching',
        cast: [], poster: form.poster, posterCrop: form.posterCrop, tmdbId: form.tmdbId, originCountry: form.originCountry, wikiUrl: form.wikiUrl, imdbUrl: form.imdbUrl,
      });
    });
    closeAddShow();
    openShow(id);
  };

  const deleteShow = () => {
    if (!editingShow) return;
    if (!window.confirm('Delete this show and its cast?')) return;
    updateData((d) => { d.shows = d.shows.filter((x) => x.id !== editingShow.id); });
    closeAddShow();
  };

  return (
    <Sheet onClose={closeAddShow} label={editingShow ? 'Edit show' : 'Add a show'}>
        <button className="ct-sheet-close" onClick={closeAddShow}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <div className="ct-sheet-title">{editingShow ? 'Edit Show' : 'Add a Show'}</div>

        <label className="ct-label">TITLE *</label>
        {/* The poster, framed the way the tile will frame it, and tappable to change that.

            Same affordance as the character sheet: the image itself is the control, with a worded
            button beside it because a tappable picture announces nothing on its own. The preview
            is 4:5 rather than the old 40x56 so what is approved here is what the grid shows. */}
        {form.poster && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setCropping(true)}
              aria-label="Adjust how the poster is framed"
              style={{ width: 44, height: 55, borderRadius: 8, flex: 'none', border: 'none', padding: 0, cursor: 'pointer', backgroundColor: 'var(--surface)', ...posterStyle(form.poster, form.posterCrop) }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                {form.tmdbId ? 'Matched from TMDb' : 'Poster'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                <button
                  type="button"
                  onClick={() => setCropping(true)}
                  style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-soft)' }}
                >
                  {form.posterCrop ? 'Reframe' : 'Adjust framing'}
                </button>
                {/* Only offered once there is something to undo, and it restores the default
                    rather than opening the cropper to hunt for where the image started. */}
                {form.posterCrop && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, posterCrop: null }))}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--text-faint)' }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {cropping && form.poster && (
          <CropModal
            file={null}
            src={form.poster}
            initial={form.posterCrop}
            aspect={TILE_ASPECT}
            onCancel={() => setCropping(false)}
            onConfirm={({ crop }) => { setForm((f) => ({ ...f, posterCrop: crop })); setCropping(false); }}
          />
        )}
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value, poster: null, posterCrop: null, tmdbId: null }))} placeholder="Search TMDb or type a title" className="ct-input" style={{ marginBottom: 8 }} />
        {results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12, maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 6 }}>
            {results.map((r) => (
              <button key={r.id} onClick={() => pickTmdb(r)} style={{ display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', border: 'none', background: 'transparent', padding: 6, borderRadius: 9, cursor: 'pointer', color: 'var(--text)' }}>
                <div style={{ width: 32, height: 46, flex: 'none', borderRadius: 6, ...bgStyle(img(r.poster_path)) }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{(r.first_air_date || '').slice(0, 4) || '—'}</div>
                </div>
              </button>
            ))}
          </div>
        )}
        {searching && <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginBottom: 12 }}>Searching TMDb&hellip;</div>}

        {/* Asked only when there's nothing to infer from, or when you've deliberately opened a
            show to edit it.
            Picking a TMDb result sets the type from its genre ids, which is better evidence than a
            choice made in two seconds while typing. And it isn't a distinction users think in —
            nobody adding a show is wondering whether it has "characters" — so putting it in the
            normal path asks them to do the app's bookkeeping.
            It stays reachable here rather than nowhere: inference is good, not perfect, and a
            documentary series inferred as scripted would otherwise be stuck with characters, a
            cumulative season filter and a TVmaze lookup that can't succeed. */}
        {(!form.tmdbId || !!editingShow) && (
          <>
            <label className="ct-label-muted" style={{ marginTop: 8 }}>TYPE</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
              {TYPES.map((t) => (
                <button key={t} onClick={() => setForm((f) => ({ ...f, type: t }))} className={`ct-tab-btn${form.type === t ? ' is-active' : ''}`}>{SHOW_TYPE_LABELS[t]}</button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-faint)', marginBottom: 16 }}>
              Scripted shows have characters played by actors; reality shows have a cast that changes.
            </div>
          </>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <div><label className="ct-label">WIKIPEDIA LINK</label><input value={form.wikiUrl} onChange={(e) => setForm((f) => ({ ...f, wikiUrl: e.target.value }))} className="ct-input" style={{ fontSize: 13.5 }} /></div>
          <div><label className="ct-label">IMDB LINK</label><input value={form.imdbUrl} onChange={(e) => setForm((f) => ({ ...f, imdbUrl: e.target.value }))} className="ct-input" style={{ fontSize: 13.5 }} /></div>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          {editingShow ? (
            <button onClick={deleteShow} className="ct-btn-danger" style={{ flex: 1 }}>Delete</button>
          ) : (
            <button onClick={closeAddShow} className="ct-btn-ghost" style={{ flex: 1 }}>Cancel</button>
          )}
          <button onClick={save} disabled={!form.title.trim()} className="ct-btn-primary" style={{ flex: 1 }}>Save</button>
        </div>
    </Sheet>
  );
}
