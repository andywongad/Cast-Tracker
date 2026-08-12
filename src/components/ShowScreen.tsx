import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { epNumFromLabel } from '../lib/utils';
import { getShowDetails, getSeasonEpisodeCount, getEpisodeCredits, hasTmdbKey } from '../lib/tmdb';
import { fetchTvmazeCast, matchCast } from '../lib/tvmaze';
import CastGrid from './CastGrid';
import RelationshipMap from './RelationshipMap';
import DensityToggle from './DensityToggle';

export default function ShowScreen() {
  const { data, settings, updateData, showById, pushRecent, setCastColumns } = useStore();
  const { activeShowId, openAddCast } = useUI();
  const show = showById(activeShowId);

  const [seasons, setSeasons] = useState<number[]>(Array.from({ length: 8 }, (_, i) => i + 1));
  const [episodeCount, setEpisodeCount] = useState<number>(24);
  const [gridMode, setGridMode] = useState(true);
  const [mapHelpOpen, setMapHelpOpen] = useState(false);
  const [castQuery, setCastQuery] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [photoNoteOpen, setPhotoNoteOpen] = useState(false);

  useEffect(() => { if (activeShowId) pushRecent(activeShowId); }, [activeShowId, pushRecent]);

  useEffect(() => {
    if (!show?.tmdbId) return;
    let alive = true;
    getShowDetails(show.tmdbId).then((d) => {
      if (!alive || !d) return;
      if (d.seasons.length) setSeasons(d.seasons);
      updateData((data2) => {
        const s = data2.shows.find((x) => x.id === show.id);
        if (!s) return;
        if (d.imdbId && !s.imdbUrl) s.imdbUrl = `https://www.imdb.com/title/${d.imdbId}/`;
        if (d.wikiGuess && !s.wikiUrl) s.wikiUrl = d.wikiGuess;
        // Land on the newest season rather than season 1 — that's what someone is most likely
        // watching. Set here rather than at render because `seasons` holds a 1..8 placeholder
        // until TMDb answers, which would briefly select season 8 for a three-season show.
        // Only fills an unset value, so an explicit choice is never overwritten.
        if (!s.currentSeason && d.seasons.length) s.currentSeason = Math.max(...d.seasons);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
    return () => { alive = false; };
  }, [show?.tmdbId]);

  // In-character stills from TVmaze. Scripted only — TVmaze's cast endpoint returns hosts and
  // judges for reality, never contestants, so a lookup there is a guaranteed miss.
  //
  // Keyed on unresolved *cast members*, not on the show. Gating this on `tvmazeId === undefined`
  // meant it fired once when a show was created — while the cast list was still empty — matched
  // nothing, and never ran again, so every cast member added afterwards silently missed out.
  // characterPhoto tri-states: undefined = never checked, null = checked with no match, string =
  // resolved. Only `undefined` triggers work, so this settles and won't loop.
  const unresolvedCast = show?.cast.some((c) => c.characterPhoto === undefined) ?? false;
  useEffect(() => {
    const id = show?.id;
    const tmdbId = show?.tmdbId;
    if (!id || !tmdbId || show?.type !== 'DRAMA' || !unresolvedCast) return;

    // Show already checked and known absent from TVmaze: mark the newcomers resolved rather than
    // re-fetching a lookup that can't succeed.
    if (show.tvmazeId === null) {
      updateData((d) => {
        const sh = d.shows.find((x) => x.id === id);
        sh?.cast.forEach((c) => { if (c.characterPhoto === undefined) c.characterPhoto = null; });
      });
      return;
    }

    let alive = true;
    // Cheap to repeat: the route is edge-cached for 24h and TVmaze image URLs are immutable.
    fetchTvmazeCast(tmdbId).then((result) => {
      if (!alive || !result) return;
      updateData((d) => {
        const sh = d.shows.find((x) => x.id === id);
        if (!sh) return;
        sh.tvmazeId = result.tvmazeId;

        const { images, report } = matchCast(sh.cast, result.cast);
        // Write every member, not just hits — a null records "checked, nothing there" and stops
        // this from re-running forever on cast TVmaze doesn't have.
        sh.cast.forEach((c) => { c.characterPhoto = images.get(c.id) ?? c.characterPhoto ?? null; });

        console.info('[tvmaze] %s: matched %d/%d, %d with images', sh.title, report.matched, sh.cast.length, report.withImage);
        if (report.unmatchedLocal.length) console.info('[tvmaze] no TVmaze entry for:', report.unmatchedLocal);
        if (report.unmatchedRemote.length) console.info('[tvmaze] unused TVmaze entries:', report.unmatchedRemote);
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id, show?.tmdbId, show?.type, show?.tvmazeId, unresolvedCast]);

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
  // Keep the latest season pinned first, descending (Season 1 last).
  // Static order — selecting a season only changes the highlight, never the ordering.
  const orderedSeasons = [...seasons].sort((a, b) => b - a);
  /**
   * `season` records the season a cast member was *added* in — there's only one number per
   * person, so "every season they appear in" isn't stored anywhere.
   *
   * Scripted shows carry their cast forward, so a season shows everyone introduced by then:
   * someone who joined in S1 is assumed still around in S3. Right for regulars, wrong for
   * characters who get written out.
   *
   * Reality replaces its cast each season — Survivor S1 and S50 share nobody — so those stay
   * filtered to the exact season. Carrying them forward would pile 17 season-1 contestants into
   * season 50.
   */
  const cumulativeSeasons = show.type === 'DRAMA';
  const visibleCastAll = hasSeasons
    ? show.cast.filter((c) => (cumulativeSeasons ? (c.season || 1) <= currentSeason : (c.season || 1) === currentSeason))
    : show.cast;
  const cq = castQuery.trim().toLowerCase();
  const visibleCast = cq ? visibleCastAll.filter((c) => c.name.toLowerCase().includes(cq) || (c.nickname || '').toLowerCase().includes(cq)) : visibleCastAll;

  const setSeason = (n: number) => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) { s.currentSeason = n; s.mapEpisode = ''; } });
  };
  const setMapEpisode = (val: string) => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) s.mapEpisode = val; });
  };

  // Only worth explaining when the grid actually shows a mix — not when every card is one kind.
  const inCharacterCount = visibleCast.filter((c) => c.characterPhoto).length;
  const showsPhotoMix = show.type === 'DRAMA' && inCharacterCount > 0 && inCharacterCount < visibleCast.length;

  // Reads the episode strip's selection, so "+ Add all cast from Ep N" always names the episode
  // that's visibly highlighted. `mapEpisode` predates the strip appearing in grid view — it's the
  // show's current episode now, not a map-only setting.
  const bulkEp = epNumFromLabel(show.mapEpisode || episodeOptions[0] || 'Ep 1');
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
      {/* Poster, link pills, notifications, caught-up and the redeem link all moved into the
          top bar's ⋯ menu — they cost ~150px above the fold and are all occasional. Only the view
          switch stays inline, because it changes what the whole screen is. */}
      {isRealityShow && (
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: 3, marginBottom: 10 }}>
          <button onClick={() => setGridMode(true)} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: gridMode ? 'var(--accent)' : 'transparent', color: gridMode ? 'var(--accent-text)' : 'var(--text-secondary)' }}>Grid</button>
          <button onClick={() => setGridMode(false)} style={{ height: 30, padding: '0 12px', border: 'none', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', background: !gridMode ? 'var(--accent)' : 'transparent', color: !gridMode ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ marginRight: 5 }}><circle cx="4" cy="4" r="2" fill="currentColor" /><circle cx="12" cy="4" r="2" fill="currentColor" /><circle cx="8" cy="12" r="2" fill="currentColor" /><path d="M5.5 5.3L6.7 10.3M10.5 5.3L9.3 10.3M6 4h4" stroke="currentColor" strokeWidth="1.2" /></svg>
            Relationship map
          </button>
        </div>
      )}

      {hasSeasons && (
        <div className="ct-hscroll" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {orderedSeasons.map((sn) => (
            <button key={sn} onClick={() => setSeason(sn)} style={{ flex: 'none', height: 32, padding: '0 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: currentSeason === sn ? 'none' : '1px solid var(--border)', background: currentSeason === sn ? 'var(--accent)' : 'transparent', color: currentSeason === sn ? 'var(--accent-text)' : 'var(--text-secondary)' }}>Season {sn}</button>
          ))}
          </div>
        </div>
      )}

      {hasSeasons && (
        // Sticky so the episode you're editing stays reachable while dragging lines further down
        // the map. Negative side margins cancel the screen's 16px padding so the bar spans edge to
        // edge when pinned; top: 0 lands it directly under the sticky top bar, which sits outside
        // this scroll container.
        <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '2px 10px', margin: '0 -16px 18px', padding: '10px 16px' }}>
          {episodeOptions.map((ep) => (
            <button key={ep} onClick={() => setMapEpisode(ep)} style={{ border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: (show.mapEpisode || 'Ep 1') === ep ? 'var(--accent-soft)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>{ep}</button>
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
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6 }}>No cast yet</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 22, maxWidth: 240 }}>Add the people you're trying to keep straight while you watch.</div>
              <button onClick={() => openAddCast()} className="ct-btn-primary" style={{ padding: '0 22px', height: 46, borderRadius: 13, fontSize: 14 }}>+ Add first cast member</button>
              {showBulk && <button onClick={bulkAdd} disabled={bulkBusy} style={{ marginTop: 10, height: 44, padding: '0 22px', border: '1.5px solid var(--text)', borderRadius: 13, background: 'transparent', color: 'var(--text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{bulkAddLabel}</button>}
            </div>
          )}
          {show.cast.length > 0 && (
            <>
              <input value={castQuery} onChange={(e) => setCastQuery(e.target.value)} placeholder="Search this cast&hellip;" style={{ width: '100%', height: 40, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', padding: '0 14px', fontSize: 13.5, marginBottom: 12 }} />
              {/* flex-end keeps the toggle right-aligned when there's no TMDb key and the
                  bulk-add button isn't rendered at all. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginBottom: 14 }}>
                {showBulk && <button onClick={bulkAdd} disabled={bulkBusy} style={{ flex: 1, minWidth: 0, height: 42, border: '1px dashed var(--border)', borderRadius: 12, background: 'transparent', color: 'var(--accent-soft)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{bulkAddLabel}</button>}
                <DensityToggle value={settings.castColumns || 2} options={[2, 3, 4]} onChange={setCastColumns} label="Cast columns" />
              </div>
              {/* The cast cards' action buttons hang 11px above the card edge, so a 12px bottom gap
                  left roughly 1px of real clearance. This clears the buttons, not the cards. */}
              {showsPhotoMix && (
                <div style={{ marginTop: -2, marginBottom: 24 }}>
                  <button
                    onClick={() => setPhotoNoteOpen((v) => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>
                      Why do some photos show the actor?
                    </span>
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style={{ transform: photoNoteOpen ? 'rotate(180deg)' : 'none', flex: 'none' }}>
                      <path d="M3 5.5L8 10.5L13 5.5" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {photoNoteOpen && (
                    <div style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: 8, background: 'var(--surface)', borderRadius: 12, padding: '12px 14px' }}>
                      In-character photos come from{' '}
                      <a href={show.tvmazeId ? `https://www.tvmaze.com/shows/${show.tvmazeId}` : 'https://www.tvmaze.com'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-soft)', fontWeight: 700, textDecoration: 'none' }}>TVmaze</a>
                      , which lists <strong style={{ color: 'var(--text)' }}>{inCharacterCount}</strong> of these {visibleCast.length}. TMDb, where the rest of this
                      cast comes from, doesn&rsquo;t allow in-character profile photos — so anyone TVmaze
                      doesn&rsquo;t list falls back to the actor&rsquo;s headshot. Minor and one-episode roles
                      are the usual gap.
                      <br /><br />
                      You can always set your own: tap a card&rsquo;s pencil, then the photo to reframe it,
                      or the badge to upload your own picture. Anything you upload stays put and won&rsquo;t
                      be replaced.
                    </div>
                  )}
                </div>
              )}
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
