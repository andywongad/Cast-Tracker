import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { bgStyle, epNumFromLabel, initials } from '../lib/utils';
import { getShowDetails, getSeasonEpisodeCount, getEpisodeCredits, hasTmdbKey } from '../lib/tmdb';
import CastGrid from './CastGrid';
import RelationshipMap from './RelationshipMap';
import NotificationToggle from './NotificationToggle';

function ShareIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><path d="M5.6 7.2l4.6-3.2M5.6 8.8l4.6 3.2" stroke="#fff" strokeWidth="1.3" /></svg>;
}

export default function ShowScreen() {
  const { data, updateData, showById, pushRecent, shareShow } = useStore();
  const { activeShowId, openWebView, openShareSheet, openRedeem, openAddCast } = useUI();
  const show = showById(activeShowId);

  const [seasons, setSeasons] = useState<number[]>(Array.from({ length: 8 }, (_, i) => i + 1));
  const [episodeCount, setEpisodeCount] = useState<number>(24);
  const [gridMode, setGridMode] = useState(true);
  const [mapHelpOpen, setMapHelpOpen] = useState(false);
  const [castQuery, setCastQuery] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => { if (activeShowId) pushRecent(activeShowId); }, [activeShowId, pushRecent]);

  useEffect(() => {
    if (!show?.tmdbId) return;
    let alive = true;
    getShowDetails(show.tmdbId).then((d) => {
      if (!alive || !d) return;
      if (d.seasons.length) setSeasons(d.seasons);
      if (!show.wikiUrl || !show.imdbUrl) {
        updateData((data2) => {
          const s = data2.shows.find((x) => x.id === show.id);
          if (!s) return;
          if (d.imdbId && !s.imdbUrl) s.imdbUrl = `https://www.imdb.com/title/${d.imdbId}/`;
          if (d.wikiGuess && !s.wikiUrl) s.wikiUrl = d.wikiGuess;
        });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
    return () => { alive = false; };
  }, [show?.tmdbId]);

  const currentSeason = show?.currentSeason || 1;

  useEffect(() => {
    if (!show?.tmdbId) { setEpisodeCount(24); return; }
    let alive = true;
    getSeasonEpisodeCount(show.tmdbId, currentSeason).then((c) => { if (alive && c) setEpisodeCount(c); });
    return () => { alive = false; };
  }, [show?.tmdbId, currentSeason]);

  const episodeOptions = useMemo(() => Array.from({ length: episodeCount }, (_, i) => `Ep ${i + 1}`), [episodeCount]);

  if (!show) return null;

  const isRealityShow = show.type === 'REALITY' || show.type === 'VARIETY';
  const mapOpen = isRealityShow && !gridMode;
  const hasSeasons = seasons.length > 0;
  const visibleCastAll = hasSeasons ? show.cast.filter((c) => (c.season || 1) === currentSeason) : show.cast;
  const cq = castQuery.trim().toLowerCase();
  const visibleCast = cq ? visibleCastAll.filter((c) => c.name.toLowerCase().includes(cq) || (c.nickname || '').toLowerCase().includes(cq)) : visibleCastAll;

  const setSeason = (n: number) => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) { s.currentSeason = n; s.caughtUpEp = ''; } });
  };
  const setCaughtUp = (val: string) => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) s.caughtUpEp = val; });
  };
  const setMapEpisode = (val: string) => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) s.mapEpisode = val; });
  };

  const bulkEp = epNumFromLabel(show.caughtUpEp || 'Ep 1');
  const bulkAdd = async () => {
    if (!show?.tmdbId || !hasTmdbKey()) return;
    setBulkBusy(true);
    try {
      const list = await getEpisodeCredits(show.tmdbId, currentSeason, bulkEp);
      const isDrama = show.type === 'DRAMA';
      updateData((d) => {
        const s = d.shows.find((x) => x.id === show.id);
        if (!s) return;
        list.forEach((p) => {
          const name = isDrama && p.character ? p.character : p.name;
          if (!name || s.cast.some((c) => c.name === name)) return;
          const color = ['#5B4FD6', '#3F5FA8', '#8B4FA0', '#4F8B7A', '#A0574F', '#4F6BA0', '#7A4FA0'][s.cast.length % 7];
          s.cast.push({
            id: 'p' + Date.now() + Math.random().toString(36).slice(2, 6), color, name, native: '', nickname: '',
            otherNames: [], desc: '', photo: p.photo || null, notes: '', gender: '', age: '', hometown: '',
            occupation: '', social: '', socialPlatform: 'Instagram', firstEp: `Ep ${bulkEp}`, season: currentSeason,
            actorName: isDrama ? p.name : '', actorTmdbId: p.id || null, wikiUrl: '', imdbUrl: '', versions: [], relationships: [],
          });
        });
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkAddLabel = bulkBusy ? 'Adding…' : `+ Add all cast from Ep ${bulkEp}`;
  const showBulk = !!show.tmdbId && hasTmdbKey();

  return (
    <div data-screen-label="Show" style={{ padding: '16px 16px 100px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: 14, flex: 'none', backgroundColor: show.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...bgStyle(show.poster) }}>
          {!show.poster && initials(show.title)}
        </div>
        <div style={{ minWidth: 0, marginTop: -7 }}>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {show.wikiUrl && <button className="ct-pill" onClick={() => openWebView(show.wikiUrl, 'Wikipedia')}>Wikipedia</button>}
            {show.imdbUrl && <button className="ct-pill" onClick={() => openWebView(show.imdbUrl, 'IMDb')}>IMDb</button>}
            <button className="ct-pill" onClick={() => openShareSheet(shareShow(show.id))}>Share</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <NotificationToggle showId={show.id} />
          </div>
          {isRealityShow && (
            <div style={{ display: 'inline-flex', marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: 3 }}>
              <button onClick={() => setGridMode(true)} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', background: gridMode ? '#6366F1' : 'transparent', color: gridMode ? '#fff' : 'var(--text-secondary)' }}>Grid</button>
              <button onClick={() => setGridMode(false)} style={{ height: 32, padding: '0 12px', border: 'none', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', background: !gridMode ? '#6366F1' : 'transparent', color: !gridMode ? '#fff' : 'var(--text-secondary)' }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 5 }}><circle cx="4" cy="4" r="2" fill="currentColor" /><circle cx="12" cy="4" r="2" fill="currentColor" /><circle cx="8" cy="12" r="2" fill="currentColor" /><path d="M5.5 5.3L6.7 10.3M10.5 5.3L9.3 10.3M6 4h4" stroke="currentColor" strokeWidth="1.2" /></svg>
                Relationship map
              </button>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Caught up through:</span>
            <select value={show.caughtUpEp || ''} onChange={(e) => setCaughtUp(e.target.value)} style={{ border: '1px solid var(--input-border)', borderRadius: 9, background: 'var(--surface)', color: 'var(--text)', fontSize: 11.5, fontWeight: 700, padding: '4px 8px' }}>
              <option value="">&mdash;</option>
              {episodeOptions.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
            </select>
          </div>
          <button onClick={() => openRedeem('cast')} style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--accent-soft)', cursor: 'pointer' }}>Have a character code? Redeem it &rarr;</button>
        </div>
      </div>

      {hasSeasons && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 8 }}>
          {seasons.map((sn) => (
            <button key={sn} onClick={() => setSeason(sn)} style={{ flex: 'none', height: 32, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: currentSeason === sn ? 'none' : '1px solid var(--border)', background: currentSeason === sn ? '#6366F1' : 'transparent', color: currentSeason === sn ? '#fff' : 'var(--text-secondary)' }}>Season {sn}</button>
          ))}
        </div>
      )}

      {mapOpen && hasSeasons && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginBottom: 18 }}>
          {episodeOptions.map((ep) => (
            <button key={ep} onClick={() => setMapEpisode(ep)} style={{ border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: (show.mapEpisode || 'Ep 1') === ep ? 'var(--accent-soft)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>{ep}</button>
          ))}
        </div>
      )}

      {gridMode ? (
        <>
          {show.cast.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px 70px', marginTop: 20 }}>
              <svg width="56" height="56" viewBox="0 0 56 56" fill="none" style={{ marginBottom: 18 }}>
                <circle cx="20" cy="22" r="8" stroke="var(--icon-muted)" strokeWidth="2" /><circle cx="38" cy="22" r="8" stroke="var(--icon-muted)" strokeWidth="2" />
                <path d="M6 46c1.5-9 7-14 14-14s12.5 5 14 14" stroke="var(--icon-muted)" strokeWidth="2" strokeLinecap="round" /><path d="M28 46c1.5-9 7-14 14-14" stroke="var(--icon-muted)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>No cast yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 22, maxWidth: 240 }}>Add the people you're trying to keep straight while you watch.</div>
              <button onClick={() => openAddCast()} className="ct-btn-primary" style={{ padding: '0 22px', height: 46, borderRadius: 13, fontSize: 14 }}>+ Add first cast member</button>
              {showBulk && <button onClick={bulkAdd} disabled={bulkBusy} style={{ marginTop: 10, height: 44, padding: '0 22px', border: '1.5px solid #6366F1', borderRadius: 13, background: 'transparent', color: '#6366F1', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{bulkAddLabel}</button>}
            </div>
          )}
          {show.cast.length > 0 && (
            <>
              <input value={castQuery} onChange={(e) => setCastQuery(e.target.value)} placeholder="Search this cast&hellip;" style={{ width: '100%', height: 40, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', padding: '0 14px', fontSize: 13.5, marginBottom: 12 }} />
              {showBulk && <button onClick={bulkAdd} disabled={bulkBusy} style={{ width: '100%', height: 42, border: '1px dashed var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--accent-soft)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>{bulkAddLabel}</button>}
              <CastGrid show={show} cast={visibleCast} />
            </>
          )}
        </>
      ) : (
        <RelationshipMap
          show={show}
          seasonCast={visibleCastAll}
          currentSeason={currentSeason}
          episodeOptions={episodeOptions}
          mapHelpOpen={mapHelpOpen}
          onToggleHelp={() => setMapHelpOpen((v) => !v)}
        />
      )}
    </div>
  );
}
