import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { epNumFromLabel } from '../lib/utils';
import { getShowDetails, getSeasonEpisodeCount, getEpisodeCredits, hasTmdbKey } from '../lib/tmdb';
import { fetchTvmazeCast, matchCast } from '../lib/tvmaze';
import CastGrid from './CastGrid';
import RelationshipMap from './RelationshipMap';
import DensityToggle from './DensityToggle';

/**
 * Select with a chevron we control. Chrome draws the native arrow at a fixed offset from the
 * border box and ignores padding-right, so nudging it means `appearance: none` plus our own
 * icon. Inherits colour from the wrapper, so it works on both the accent and surface fills.
 */
function SelectField({ value, onChange, label, width, bg, fg, children }: {
  value: string | number;
  onChange: (v: string) => void;
  label: string;
  width: string;
  bg: string;
  fg: string;
  children: React.ReactNode;
}) {
  return (
    // fontSize must match the select's: `width` is in ch units, which resolve against *this*
    // element's font. Inheriting the 16px body size made every dropdown ~10px too wide.
    <div style={{ position: 'relative', width, flex: 'none', display: 'inline-flex', color: fg, fontSize: 13.5 }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        style={{
          appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
          width: '100%', height: 38, border: 'none', borderRadius: 11, background: bg, color: fg,
          padding: '0 30px 0 10px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
        }}
      >
        {children}
      </select>
      <svg
        width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
      >
        <path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

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

  // Shows open on Season 1 and you work forward from there. `currentSeason` is only set once you
  // pick one, so there's no auto-jump to the newest season.
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
  // Ascending, matching the episode list beside it — Season 1 first, then 2, and so on. The old
  // descending order made sense when these were pills competing for horizontal space; in a
  // dropdown, counting up is what people expect.
  const orderedSeasons = [...seasons].sort((a, b) => a - b);
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
  // Width from the widest label each dropdown will actually render, so a 6-season show doesn't
  // reserve room for Survivor's 51. "Season " is 7 characters, "Ep " is 3; the +42px covers the
  // side padding and the native dropdown arrow (box-sizing is border-box globally).
  const seasonDigits = String(Math.max(1, ...orderedSeasons)).length;
  const episodeDigits = String(Math.max(1, episodeOptions.length)).length;
  const seasonSelW = `calc(${7 + seasonDigits}ch + 42px)`;
  const episodeSelW = `calc(${3 + episodeDigits}ch + 42px)`;

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
          if (!name) return;

          /**
           * Low-water mark. Someone already in the cast keeps the *earliest* episode they've been
           * imported from, and an import from further back moves them earlier.
           *
           * Before this, the first import won permanently: adding everyone from S5 E8 stamped the
           * entire cast season 5, and a later import from S1 E1 skipped them silently — so the
           * season filter, which reads this field, showed nobody in seasons 1-4. Now the record
           * corrects itself as you work backwards or watch forwards.
           */
          const existing = s.cast.find((c) => c.name === name);
          if (existing) {
            const knownSeason = existing.season || 1;
            // epNumFromLabel defaults to 1 on an unparseable label, which would read as "episode 1"
            // and block every correction. No recorded episode means unknown, so anything beats it.
            const knownEp = existing.firstEp ? epNumFromLabel(existing.firstEp) : Infinity;
            const isEarlier =
              currentSeason < knownSeason || (currentSeason === knownSeason && bulkEp < knownEp);
            if (isEarlier) {
              existing.season = currentSeason;
              existing.firstEp = `Ep ${bulkEp}`;
            }
            return;
          }

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

  const bulkAddLabel = bulkBusy ? 'Adding…' : `+ Add all cast (S${currentSeason}E${bulkEp})`;
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

      {/* Season and episode as native selects rather than pill rows. iOS renders these as its
          wheel picker, which handles Survivor's 50 seasons and a 24-episode run without a
          horizontal scroll strip — and collapses two rows into one. Sticky so both stay reachable
          while scrolling a long cast list or dragging lines on the map. */}
      {hasSeasons && (
        <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg)', borderBottom: '1px solid var(--border)', margin: '0 -16px 12px', padding: '8px 16px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>Pick a season and episode</div>
          {/* Wraps rather than squeezing: three controls don't fit one line on a narrow phone. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SelectField
            value={currentSeason}
            onChange={(v) => setSeason(parseInt(v))}
            label="Season"
            width={seasonSelW}
            bg="var(--accent)"
            fg="var(--accent-text)"
          >
            {orderedSeasons.map((sn) => <option key={sn} value={sn}>Season {sn}</option>)}
          </SelectField>
          <SelectField
            value={show.mapEpisode || episodeOptions[0] || 'Ep 1'}
            onChange={setMapEpisode}
            label="Episode"
            width={episodeSelW}
            bg="var(--surface)"
            fg="var(--text)"
          >
            {episodeOptions.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
          </SelectField>
          {showBulk && (
            <button onClick={bulkAdd} disabled={bulkBusy} style={{ flex: 'none', height: 38, border: '1px dashed var(--border)', borderRadius: 11, background: 'transparent', color: 'var(--accent-soft)', fontSize: 12.5, fontWeight: 700, cursor: bulkBusy ? 'default' : 'pointer', padding: '0 14px', whiteSpace: 'nowrap' }}>{bulkAddLabel}</button>
          )}
          </div>
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
