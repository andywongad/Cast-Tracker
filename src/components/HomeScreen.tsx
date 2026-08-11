import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { ShowTile, RecentShowTile } from './ShowTile';
import { searchShows, hasTmdbKey, img, inferShowType, type TmdbShowResult } from '../lib/tmdb';
import { bgStyle } from '../lib/utils';
import DensityToggle from './DensityToggle';

export default function HomeScreen() {
  const { data, settings, recentShows, showById, backupState, dismissBackupNudge, setShowColumns } = useStore();
  const { query, setQuery, openAddShow, openRedeem, openEditShow, openSettings } = useUI();
  const [tmdbResults, setTmdbResults] = useState<TmdbShowResult[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  // Surface the device-only storage risk once there's enough in here to be worth losing,
  // and only until the user either exports or waves it off.
  const trackedCast = useMemo(() => data.shows.reduce((n, s) => n + s.cast.length, 0), [data.shows]);
  const showBackupNudge = trackedCast >= 8 && !backupState.lastExportAt && !backupState.dismissedAt;

  useEffect(() => {
    if (!isSearching || !hasTmdbKey()) { setTmdbResults([]); setTmdbSearching(false); return; }
    setTmdbSearching(true);
    const t = setTimeout(() => {
      searchShows(query).then((r) => { setTmdbResults(r); setTmdbSearching(false); }).catch(() => setTmdbSearching(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query, isSearching]);

  const cols = settings.showColumns || 4;
  const gridCols = `repeat(${cols}, 1fr)`;

  const searchResults = useMemo(() => data.shows.filter((s) => (s.title + ' ' + s.type).toLowerCase().includes(q)), [data.shows, q]);
  const currentShows = useMemo(() => data.shows.filter((s) => s.status !== 'completed'), [data.shows]);
  const completedShows = useMemo(() => data.shows.filter((s) => s.status === 'completed'), [data.shows]);
  const recentList = useMemo(() => recentShows.map((id) => showById(id)).filter((s): s is NonNullable<typeof s> => !!s), [recentShows, showById]);

  const openTmdbAsShow = (r: TmdbShowResult) => {
    setQuery('');
    openAddShow({
      title: r.name,
      type: inferShowType(r.genre_ids),
      poster: img(r.poster_path),
      tmdbId: r.id,
      originCountry: r.origin_country?.[0] || '',
    });
  };

  return (
    <div data-screen-label="Home" style={{ padding: '16px 16px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px', borderRadius: 13, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 18 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shows" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)' }} />
        {isSearching && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: 0 }}>&times;</button>}
      </div>

      <button onClick={() => openRedeem('show')} style={{ background: 'none', border: 'none', padding: 0, margin: '-10px 0 18px', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)', cursor: 'pointer' }}>Have a show code? Redeem it &rarr;</button>

      {showBackupNudge && !isSearching && (
        <div style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)', borderRadius: 18, padding: 16, marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your cast lives only on this device</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
            There&rsquo;s no account or sync — clearing your browser data would erase {trackedCast} {trackedCast === 1 ? 'person' : 'people'} across {data.shows.length} {data.shows.length === 1 ? 'show' : 'shows'}. Export a backup file to keep a copy.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={openSettings} style={{ flex: 1, height: 40, border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Export a backup</button>
            <button onClick={dismissBackupNudge} style={{ flex: 'none', height: 40, padding: '0 14px', border: 'none', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Not now</button>
          </div>
        </div>
      )}

      {recentList.length > 0 && !isSearching && (
        <>
          <div className="ct-eyebrow">Recently Viewed</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 22 }}>
            {recentList.map((s) => <RecentShowTile key={s.id} show={s} />)}
          </div>
        </>
      )}

      {isSearching && (
        <>
          <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>RESULTS &middot; {searchResults.length}</div>
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
            {searchResults.map((s) => <ShowTile key={s.id} show={s} columns={cols} done={s.status === 'completed'} />)}
          </div>
          {searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0 0' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No shows match &ldquo;{query}&rdquo;.</div>
              <button onClick={() => openAddShow()} style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ Add &ldquo;{query}&rdquo; as a new show</button>
            </div>
          )}
          {tmdbSearching && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 18 }}>Searching TMDb&hellip;</div>}
          {tmdbResults.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '20px 0 10px' }}>FROM TMDB &middot; TAP TO ADD</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tmdbResults.map((r) => (
                  <button key={r.id} onClick={() => openTmdbAsShow(r)} style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface)', padding: 8, borderRadius: 12, cursor: 'pointer', color: 'var(--text)' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, flex: 'none', background: 'var(--border)', ...bgStyle(img(r.poster_path)) }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                      <div style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>{(r.first_air_date || '').slice(0, 4) || '—'}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!isSearching && (
        <>
          {data.shows.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--border)', borderRadius: 18, marginBottom: 8 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Track your first show</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.4 }}>Add a show to start tracking cast, episodes, and relationships.</div>
              <button onClick={() => openAddShow()} style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>Add a show</button>
            </div>
          )}
          {data.shows.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                {/* Count stays welded to its label; the control sits apart, or the two runs of
                    numerals read as one string ("3 2 3 4"). */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                  <span className="ct-eyebrow" style={{ marginBottom: 0 }}>Currently watching</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{currentShows.length}</span>
                </div>
                <DensityToggle value={cols} options={[2, 3, 4]} onChange={setShowColumns} label="Show columns" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 26 }}>
                {currentShows.map((s) => <ShowTile key={s.id} show={s} columns={cols} />)}
                {currentShows.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 14 }}>Nothing in progress.</div>}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="ct-eyebrow" style={{ marginBottom: 0 }}>Completed</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{completedShows.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                {completedShows.map((s) => <ShowTile key={s.id} show={s} columns={cols} done />)}
                {completedShows.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 14 }}>Nothing finished yet.</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
