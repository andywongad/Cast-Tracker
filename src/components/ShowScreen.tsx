import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { epNumFromLabel } from '../lib/utils';
import { getShowDetails, getEpisodeCredits, getAggregateCredits, getSeasonEpisodes, hasTmdbKey, type AggregateCastMember, type SeasonEpisode } from '../lib/tmdb';
import { classifyShow, coreCast, type ShapeReport } from '../lib/showShape';
import { toEpisodePeople, missingFromCast, addPeopleToShow, type EpisodePerson } from '../lib/episodeCast';
import { useFirstSeasons } from '../lib/firstSeason';
import { fetchTvmazeCast, matchCast } from '../lib/tvmaze';
import CastGrid from './CastGrid';
import RelationshipMap from './RelationshipMap';
import DensityToggle from './DensityToggle';
import SeasonEpisodeRails from './SeasonEpisodeRails';
import TieredCastView from './TieredCastView';
import SerialCastView from './SerialCastView';

/** Episode credits already fetched this session, keyed showId:season:episode. */
const episodeCastCache = new Map<string, EpisodePerson[]>();

export default function ShowScreen() {
  const { data, settings, updateData, showById, pushRecent, setCastColumns } = useStore();
  const { activeShowId, openAddCast } = useUI();
  const show = showById(activeShowId);

  // A placeholder so the rail has something to draw before TMDb answers. `seasonsReal` says
  // whether these are the show's actual seasons yet — anything that spends requests per season
  // has to wait for that, or it burns them on seasons 7 and 8 of a six-season show.
  const [seasons, setSeasons] = useState<number[]>(Array.from({ length: 8 }, (_, i) => i + 1));
  const [seasonsReal, setSeasonsReal] = useState(false);
  const [episodeCount, setEpisodeCount] = useState<number>(24);
  const [gridMode, setGridMode] = useState(true);
  const [mapHelpOpen, setMapHelpOpen] = useState(false);
  const [castQuery, setCastQuery] = useState('');
  const [photoNoteOpen, setPhotoNoteOpen] = useState(false);
  const [credits, setCredits] = useState<AggregateCastMember[]>([]);
  const [totalEpisodes, setTotalEpisodes] = useState(0);
  const [seasonEpisodes, setSeasonEpisodes] = useState<SeasonEpisode[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  /**
   * Tagged with the episode it was fetched for. An untagged list is a trap: selecting a new
   * episode re-runs everything downstream immediately, while the fetch is still in flight, so
   * consumers see the *previous* episode's people under the new episode's number. The auto-add
   * below marked that episode handled and then skipped the real data when it landed, which showed
   * up as guests appearing one episode late.
   */
  const [episodeCast, setEpisodeCast] = useState<{ key: string; people: EpisodePerson[] }>({ key: '', people: [] });
  const [episodeCastLoading, setEpisodeCastLoading] = useState(false);

  useEffect(() => { if (activeShowId) pushRecent(activeShowId); }, [activeShowId, pushRecent]);
  useEffect(() => { setSeasonsReal(false); }, [show?.tmdbId]);

  useEffect(() => {
    if (!show?.tmdbId) return;
    let alive = true;
    getShowDetails(show.tmdbId).then((d) => {
      if (!alive || !d) return;
      if (d.seasons.length) { setSeasons(d.seasons); setSeasonsReal(true); }
      setTotalEpisodes(d.totalEpisodes);
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

        // Dev only, like the classification line below. These fire on any show with cast that
        // hasn't been looked up yet, and print the show title plus every unmatched character name.
        if (import.meta.env.DEV) {
          console.info('[tvmaze] %s: matched %d/%d, %d with images', sh.title, report.matched, sh.cast.length, report.withImage);
          if (report.unmatchedLocal.length) console.info('[tvmaze] no TVmaze entry for:', report.unmatchedLocal);
          if (report.unmatchedRemote.length) console.info('[tvmaze] unused TVmaze entries:', report.unmatchedRemote);
        }
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.id, show?.tmdbId, show?.type, show?.tvmazeId, unresolvedCast]);

  // Shows open on Season 1 and you work forward from there. `currentSeason` is only set once you
  // pick one, so there's no auto-jump to the newest season.
  const currentSeason = show?.currentSeason || 1;
  // Derived up here rather than beside the grid, because the episode-credits effect below needs
  // it. Equivalent to the old expression: episodeOptions[0] is always "Ep 1".
  const currentEp = epNumFromLabel(show?.mapEpisode || 'Ep 1');

  /**
   * One call per season selection covers the episode rail's numbers and titles *and* every
   * episode's guest stars. The season payload embeds guest_stars, verified identical to the
   * per-episode credits endpoint, so a 24-episode season costs 1 request rather than 24.
   */
  useEffect(() => {
    if (!show?.tmdbId) { setSeasonEpisodes([]); setEpisodeCount(24); return; }
    let alive = true;
    setEpisodesLoading(true);
    getSeasonEpisodes(show.tmdbId, currentSeason)
      .then((eps) => {
        if (!alive) return;
        setSeasonEpisodes(eps);
        if (eps.length) setEpisodeCount(eps.length);
      })
      .finally(() => { if (alive) setEpisodesLoading(false); });
    return () => { alive = false; };
  }, [show?.tmdbId, currentSeason]);

  /**
   * The selected episode's credited cast, regulars and guests together.
   *
   * One request per episode selection, memoised for the session and edge-cached for an hour, so
   * moving back and forth along the rail costs nothing after the first visit. The season payload
   * already in hand would have been free, but it only carries guest stars — pairing it with the
   * show's core cast over-reports badly (32 people against the 11 TMDb credits on Sopranos S3E4),
   * and placeholders for people who aren't in the episode would defeat the point.
   */
  useEffect(() => {
    const tmdbId = show?.tmdbId;
    if (!tmdbId || !hasTmdbKey()) { setEpisodeCast({ key: '', people: [] }); setEpisodeCastLoading(false); return; }
    const key = `${tmdbId}:${currentSeason}:${currentEp}`;
    const hit = episodeCastCache.get(key);
    // A cached episode is not a load — going straight to the cards beats flashing a skeleton.
    if (hit) { setEpisodeCast({ key, people: hit }); setEpisodeCastLoading(false); return; }

    let alive = true;
    setEpisodeCastLoading(true);
    getEpisodeCredits(tmdbId, currentSeason, currentEp).then((list) => {
      const people = toEpisodePeople(list);
      // Cache even an empty result: a season/episode TMDb has no credits for shouldn't be asked
      // about again every time it's selected.
      episodeCastCache.set(key, people);
      if (alive) { setEpisodeCast({ key, people }); setEpisodeCastLoading(false); }
    });
    return () => { alive = false; };
  }, [show?.tmdbId, currentSeason, currentEp]);

  /** Series-level credits: one call, and the basis for classification and every episode count. */
  useEffect(() => {
    if (!show?.tmdbId) { setCredits([]); return; }
    let alive = true;
    getAggregateCredits(show.tmdbId).then((c) => { if (alive) setCredits(c); });
    return () => { alive = false; };
  }, [show?.tmdbId]);

  const shape: ShapeReport | null = useMemo(
    () => classifyShow(credits, totalEpisodes),
    [credits, totalEpisodes],
  );

  // Exposed for spot-checking against real shows — the thresholds in showShape.ts are calibrated
  // on a handful of samples and the ensemble/procedural boundary is the shakiest of them.
  // Dev only: this is a calibration aid for me, not something a tester should be shown, and it
  // fired on every show open.
  useEffect(() => {
    if (import.meta.env.DEV && shape && show?.title) {
      console.info('[showShape] %s → %s (core %d of %d cast, %d eps, threshold %.1f eps)',
        show.title, shape.shape, shape.coreCount, shape.castSize, shape.totalEpisodes, shape.coreThreshold);
    }
  }, [shape, show?.title]);

  const episodeOptions = useMemo(() => Array.from({ length: episodeCount }, (_, i) => `Ep ${i + 1}`), [episodeCount]);

  /**
   * On a procedural or an anthology, selecting an episode brings in everyone credited on it --
   * the episode's regulars as well as its guests.
   *
   * These shows hand you a new cast every episode, so the placeholder grid meant pressing "add
   * all" before the screen was useful. Placeholders earn their keep when most of the episode is
   * already yours; here almost none of it ever is, and that goes for the regulars too on a show
   * whose run is long enough that its leads change.
   *
   * Limited to these two shapes on purpose, and the reason is the same one that made auto-import
   * a bad default in the first place. Procedural episodes are self-contained, so pulling in the
   * cast of episode 20 tells you nothing about episode 5. On a serialised ensemble it would,
   * which is why The Sopranos keeps its placeholders and its "nothing is saved until you tap".
   *
   * Only the selected episode is ever fetched or added. Nothing is pre-loaded: an episode you
   * never open costs no request and adds no record.
   */
  const isTiered = shape?.shape === 'procedural' || shape?.shape === 'anthology';
  /**
   * Every scripted show, not just the procedurals. Selecting an episode is the gesture that means
   * "show me these people", and it shouldn't matter whether the show happens to reuse its cast.
   * Reality is excluded: its casts are per-season rosters, its episode credits are mostly hosts,
   * and the season is the unit people think in there.
   */
  const autoLoads = show?.type === 'DRAMA';
  // Keyed per episode so this fires once per selection rather than on every render that follows.
  const autoAdded = useRef(new Set<string>());
  useEffect(() => {
    if (!autoLoads || !show?.id || !show.tmdbId) return;
    // Only act on credits that belong to the episode currently selected, never on the previous
    // episode's list still sitting in state while this one loads.
    const key = `${show.tmdbId}:${currentSeason}:${currentEp}`;
    if (episodeCast.key !== key || !episodeCast.people.length) return;
    if (autoAdded.current.has(key)) return;

    const missing = missingFromCast(episodeCast.people, show.cast, show.type === 'DRAMA');
    autoAdded.current.add(key);
    if (!missing.length) return;

    updateData((d) => {
      const s2 = d.shows.find((x) => x.id === show.id);
      if (!s2) return;
      // auto: nobody asked for these by name, so they stay disposable until edited.
      addPeopleToShow(s2, missing, { isDrama: show.type === 'DRAMA', season: currentSeason, episode: currentEp, auto: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoads, show?.id, currentSeason, currentEp, episodeCast]);

  // Scripted only. Reality's stored season is already correct, so spending a request per season
  // on it would buy nothing.
  /**
   * Scripted, and not a procedural. Reality's stored season is already correct, so it needs
   * nothing here — and a procedural doesn't filter by season at all now that the screen shows one
   * episode's cast, so building the map would spend a request per season on an answer nothing
   * reads. That is 25 requests on Law & Order, none of which anyone asked for.
   *
   * Gated on `shape` being known rather than just on `isTiered`, or the first render — before the
   * series credits land and the show can be classified — would start the fetch anyway.
   */
  const firstSeasons = useFirstSeasons(
    show?.tmdbId ?? null,
    seasons,
    seasonsReal && !!shape && !isTiered && show?.type === 'DRAMA',
  );
  // Where the viewer is, and therefore the ceiling on what "so far" may include.
  const viewerAt = { season: currentSeason, episode: currentEp };

  if (!show) return null;

  const isRealityShow = show.type === 'REALITY' || show.type === 'VARIETY';
  const mapOpen = isRealityShow && !gridMode;
  const hasSeasons = seasons.length > 0;
  // Ascending, matching the episode list beside it — Season 1 first, then 2, and so on. The old
  // descending order made sense when these were pills competing for horizontal space; in a
  // dropdown, counting up is what people expect.
  const orderedSeasons = [...seasons].sort((a, b) => a - b);
  /**
   * Who belongs on screen for the selected season.
   *
   * Reality filters to the exact season, on the stored `season` field. That field records the
   * season you imported someone in, which for reality is the same thing as the season they were
   * in — casts are disjoint and you import one season at a time. Carrying them forward would pile
   * 17 season-1 contestants into season 50.
   *
   * Scripted carries its cast forward, and asks TMDb rather than the stored field. `season` is an
   * import stamp, so filtering on it answered a question about your import history: The Sopranos
   * imported from season 3 stamped all forty characters season 3 and rendered season 1 blank.
   * `firstSeasons` is derived from per-season credits instead — see lib/firstSeason.ts.
   *
   * Anyone the map doesn't cover stays visible: hand-added cast has no actorTmdbId and can never
   * be placed, and an actor TMDb doesn't list is a gap in the data, not a reason to hide someone
   * the user typed in themselves. While the map is still loading it is null and nothing is
   * filtered at all.
   */
  const visibleCastAll = !hasSeasons
    ? show.cast
    : show.type !== 'DRAMA'
      ? show.cast.filter((c) => (c.season || 1) === currentSeason)
      : firstSeasons
        ? show.cast.filter((c) => {
            const first = c.actorTmdbId ? firstSeasons[c.actorTmdbId] : undefined;
            return first === undefined || first <= currentSeason;
          })
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
  const bulkEp = currentEp;

  /**
   * Everyone TMDb credits in the selected episode, and which of them aren't in the cast yet.
   *
   * Selecting an episode shows these straight away as placeholder cards; nothing is saved until
   * one is tapped. Browsing the rail used to be inert — you had to press an import button, and
   * pressing it wrote 34 records for a single Sopranos episode whether or not you wanted them.
   * Costs no extra requests: guests ride along on the season payload, regulars on the series
   * aggregate, both already fetched.
   */
  // Plain consts, not useMemo: this sits after the `if (!show) return null` guard above, so a hook
  // here would change the hook count on a show that's been deleted.
  const selectedEpisode = seasonEpisodes.find((e) => e.number === bulkEp) || null;
  // Stale-guarded: while a new episode's credits load this is empty rather than the last
  // episode's, so placeholders never advertise the wrong episode.
  const currentEpisodeCast =
    episodeCast.key === `${show.tmdbId}:${currentSeason}:${currentEp}` ? episodeCast.people : [];
  const missingPeople = missingFromCast(currentEpisodeCast, show.cast, show.type === 'DRAMA');

  const addPeople = (people: EpisodePerson[]) => {
    updateData((d) => {
      const s2 = d.shows.find((x) => x.id === show.id);
      if (!s2) return;
      addPeopleToShow(s2, people, { isDrama: show.type === 'DRAMA', season: currentSeason, episode: bulkEp });
    });
  };

  // Kept for the two empty states, where importing everything is the primary action rather than
  // a shortcut. Same shared code path as tapping a single placeholder.
  const bulkAdd = () => addPeople(missingPeople);

  const bulkAddLabel = `+ Add cast from S${currentSeason} E${bulkEp}`;
  const showBulk = !!show.tmdbId && hasTmdbKey();

  return (
    // No top padding. The sticky header carries its own, and 16px of gap between the top bar and
    // a header that is the same colour was reading as nothing but lost cast. Anything that used
    // to lean on this padding sets its own top margin below.
    <div data-screen-label="Show" style={{ padding: '0 16px 100px' }}>
      {/* Poster, link pills, notifications, caught-up and the redeem link all moved into the
          top bar's ⋯ menu — they cost ~150px above the fold and are all occasional. Only the view
          switch stays inline, because it changes what the whole screen is. */}
      {isRealityShow && (
        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: 3, margin: '10px 0' }}>
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
      {/* One sticky block for everything that controls what the grid shows: the rails, the import
          button, the search field and the density toggle. They're stacked in one container rather
          than each given its own `top` offset, because the header's height changes with content —
          the button appears only for TMDb-backed shows — and a hardcoded offset would be wrong the
          moment it did. */}
      {(hasSeasons || (gridMode && show.cast.length > 0)) && (
        <div style={{ position: 'sticky', top: 0, zIndex: 6, background: 'var(--bg)', borderBottom: '1px solid var(--border)', margin: '0 -16px 12px', padding: '4px 16px 8px' }}>
          {/* Rails rather than the two native selects. Those fitted on one row and got iOS's wheel
              picker for free; these cost ~100px more and buy episode titles, scanning, and a
              selection pinned in place while you browse. */}
          {hasSeasons && (
            <SeasonEpisodeRails
              seasons={orderedSeasons}
              currentSeason={currentSeason}
              onSeasonChange={setSeason}
              episodes={seasonEpisodes}
              currentEpisode={bulkEp}
              onEpisodeChange={(n) => setMapEpisode(`Ep ${n}`)}
              episodesLoading={episodesLoading}
              /* Selecting an episode now shows its cast as placeholder cards, so this is no longer
                 the way in — it's the shortcut for taking all of them at once, and it only appears
                 when there is actually something left to take. Two lines, breaking after "Add all",
                 so it stays narrow enough to share the episode row. */
              trailing={showBulk && missingPeople.length > 0 ? (
                <button
                  onClick={() => addPeople(missingPeople)}
                  aria-label={`Add all ${missingPeople.length} people from season ${currentSeason} episode ${bulkEp} to your cast`}
                  style={{
                    flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    minHeight: 38, padding: '0 10px', border: '1px dashed var(--border)', borderRadius: 11,
                    background: 'transparent', color: 'var(--accent-soft)', fontSize: 11.5, fontWeight: 700,
                    lineHeight: 1.25, whiteSpace: 'nowrap', cursor: 'pointer',
                  }}
                >
                  <span>+ Add all {missingPeople.length}</span>
                  <span>from S{currentSeason} E{bulkEp}</span>
                </button>
              ) : undefined}
            />
          )}

          {/* Search and the column toggle share a row: both are ways of narrowing what you're
              looking at, and on a phone the toggle alone was costing a whole line above the grid. */}
          {gridMode && show.cast.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: hasSeasons ? 8 : 0 }}>
              <input
                value={castQuery}
                onChange={(e) => setCastQuery(e.target.value)}
                placeholder="Search this cast&hellip;"
                style={{ flex: 1, minWidth: 0, height: 38, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', padding: '0 14px', fontSize: 13.5 }}
              />
              <div style={{ flex: 'none' }}>
                <DensityToggle value={settings.castColumns || 2} options={[2, 3, 4]} onChange={setCastColumns} label="Cast columns" />
              </div>
            </div>
          )}
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
              {/* Importing one episode leads: it can only tell you about people you've already
                  met. Manual entry is the fallback for shows TMDb doesn't cover, so it's a plain
                  text button — and takes the primary style when there's no TMDb id and it's the
                  only way in. */}
              {showBulk && (
                <>
                  <button onClick={bulkAdd} className="ct-btn-primary" style={{ padding: '0 22px', height: 46, borderRadius: 13, fontSize: 14 }}>
                    {bulkAddLabel}
                  </button>
                  <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6, maxWidth: 260 }}>
                    Only the people in that episode. Pick a different one above.
                  </div>
                </>
              )}

              <button
                onClick={() => openAddCast()}
                className={showBulk ? undefined : 'ct-btn-primary'}
                style={showBulk
                  ? { marginTop: 16, border: 'none', background: 'none', padding: '6px 4px', color: 'var(--accent-soft)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }
                  : { padding: '0 22px', height: 46, borderRadius: 13, fontSize: 14 }}
              >
                + Add cast manually
              </button>
            </div>
          )}
          {show.cast.length > 0 && (
            <>
              {/* Search and the density toggle moved up into the sticky header, so they stay
                  reachable while scrolling a long cast list. */}
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
              {/* Layout follows the shape of the show's cast. Ensembles keep the season grid —
                  everyone accumulates, so episode counts and season ranges are what's missing.
                  Procedurals and anthologies get the tiered view instead: a fixed core has
                  nothing to do with which season you're on, and a guest list does. */}
              {/* A filter that matches nothing used to render nothing at all — the "No cast yet"
                  block above is gated on the show having no cast, which is false here, so The
                  Sopranos on season 1 was a blank page under the rails with 40 characters in it.
                  Say which of the two filters emptied the grid, and offer the way out. */}
              {visibleCast.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '34px 20px', border: '1px dashed var(--border)', borderRadius: 16 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>
                    {cq ? `No one here matches “${castQuery.trim()}”` : `No one from your cast appears in season ${currentSeason}`}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: cq ? 0 : 16 }}>
                    {cq
                      ? `You've added ${visibleCastAll.length} ${visibleCastAll.length === 1 ? 'person' : 'people'} to this season.`
                      // "from other seasons", not "later": a reality show filters to the exact
                      // season, so Survivor on season 3 is empty because its cast sits in seasons
                      // 1 and 2 — earlier, not later.
                      : `You've added ${show.cast.length} ${show.cast.length === 1 ? 'person' : 'people'} to this show, from other seasons.`}
                  </div>
                  {!cq && showBulk && (
                    <button onClick={bulkAdd} className="ct-btn-primary" style={{ padding: '0 20px', height: 42, borderRadius: 12, fontSize: 13.5 }}>
                      {bulkAddLabel}
                    </button>
                  )}
                </div>
              ) : shape?.shape === 'procedural' || shape?.shape === 'anthology' ? (
                <TieredCastView
                  show={show}
                  cast={visibleCast}
                  regulars={coreCast(credits, totalEpisodes)}
                  episode={selectedEpisode}
                  episodePeople={currentEpisodeCast}
                  loading={episodeCastLoading}
                  onAddMissing={() => openAddCast()}
                  onAddPerson={showBulk && !cq ? (person) => addPeople([person]) : undefined}
                  guestsAutoAdded={isTiered}
                  searching={!!cq}
                />
              ) : autoLoads ? (
                /* Serialised scripted show: the episode on top, everyone met so far underneath.
                   Placeholders are the fallback for the moment before auto-add lands, or if the
                   credits fetch failed; once it has run there is nothing missing to show. */
                <SerialCastView
                  show={show}
                  cast={visibleCast}
                  episodePeople={currentEpisodeCast}
                  episodeNumber={currentEp}
                  at={viewerAt}
                  firstSeasons={firstSeasons}
                  loading={episodeCastLoading}
                  ghosts={missingPeople}
                  onAddGhost={showBulk && !cq ? (person) => addPeople([person]) : undefined}
                  searching={!!cq}
                />
              ) : (
                /* Reality: the season roster is the unit, and tapping an episode doesn't change
                   which contestants that season had. */
                <CastGrid show={show} cast={visibleCast} />
              )}
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
