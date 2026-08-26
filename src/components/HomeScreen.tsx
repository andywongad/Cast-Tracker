import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { useAuth } from '../hooks/useAuth';
import { isSyncConfigured } from '../lib/supabase';
import { ShowTile, RecentShowTile } from './ShowTile';
import { searchShows, hasTmdbKey, img, inferShowType, type TmdbShowResult } from '../lib/tmdb';
import { bgStyle } from '../lib/utils';
import DensityToggle from './DensityToggle';

export default function HomeScreen() {
  const { data, settings, recentShows, showById, backupState, dismissBackupNudge, setShowColumns, keptTotal } = useStore();
  const { query, setQuery, openAddShow, openSettings } = useUI();
  const { session } = useAuth();
  const [tmdbResults, setTmdbResults] = useState<TmdbShowResult[]>([]);
  const [tmdbSearching, setTmdbSearching] = useState(false);

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;

  /**
   * Surface the device-only storage risk once there's enough here to be worth losing.
   *
   * Counted on records a backup would actually carry, not on everything on screen. Auto-loaded
   * cast reloads from TMDb by itself, and counting it would have this nagging about a library of
   * four hundred people when twelve of them are the user's.
   *
   * Comes back as that number grows past whatever it was when the nudge was last exported or
   * dismissed. Dismissing used to silence it permanently, which quietly turned "not yet" into
   * "never" for the person who most needed asking again later.
   */
  const trackedCast = keptTotal;
  const acked = backupState.ackedAtCount ?? 0;
  const neverActioned = !backupState.lastExportAt && !backupState.dismissedAt;
  const grownSince = trackedCast >= acked + 15;
  // Signed in, the device is not the only copy, so the nudge's whole premise is false. A file
  // export is still offered in Settings for anyone who wants one.
  const showBackupNudge = !session && trackedCast >= 8 && (neverActioned || grownSince);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 46, padding: '0 14px', borderRadius: 13, background: 'var(--field-bg)', boxShadow: 'var(--shadow-card)', marginBottom: 18 }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="var(--text-muted)" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search shows" type="search" aria-label="Search your shows and TMDb" style={{ flex: 1, alignSelf: 'stretch', minWidth: 0, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, color: 'var(--text)' }} />
        {isSearching && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 18, cursor: 'pointer', padding: 0 }}>&times;</button>}
      </div>


      {showBackupNudge && !isSearching && (
        <div style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)', borderRadius: 18, padding: 16, marginBottom: 22 }}>
          {/* "There's no account or sync" was true when this was written and became a lie the day
              sync shipped — on the same screen that now tells first-time users an account exists.
              Suppressed entirely when signed in: the premise is the device being the only copy,
              and it isn't. */}
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Your cast lives only on this device</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 12 }}>
            You&rsquo;re not signed in, so nothing is backed up. Resetting the app or clearing your
            browser data would erase the {trackedCast} {trackedCast === 1 ? 'character' : 'characters'} you&rsquo;ve
            edited or added yourself, across {data.shows.length} {data.shows.length === 1 ? 'show' : 'shows'},
            with no way to get them back. Export a file to keep a copy, or sign in to save them to
            an account.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={openSettings} style={{ flex: 1, height: 40, border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Export a backup</button>
            <button onClick={dismissBackupNudge} style={{ flex: 'none', height: 40, padding: '0 14px', border: 'none', borderRadius: 12, background: 'var(--surface)', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Not now</button>
          </div>
        </div>
      )}

      {recentList.length > 0 && !isSearching && (
        <>
          <h2 className="ct-eyebrow" style={{ margin: 0 }}>Recently Viewed</h2>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4, marginBottom: 22 }}>
            {recentList.map((s) => <RecentShowTile key={s.id} show={s} />)}
          </div>
        </>
      )}

      {isSearching && (
        <>
          {/* Only shown when your library actually matches. A "RESULTS · 0" header and a
              "No shows match" block used to render above the TMDb list on every search for a show
              you don't own yet — roughly 100px of dead space pushing the useful results down,
              which is what buries them behind the keyboard on a phone. */}
          {searchResults.length > 0 && (
            <>
              <div style={{ fontSize: 13, fontWeight: 500, letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 10 }}>IN YOUR LIBRARY &middot; {searchResults.length}</div>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14 }}>
                {searchResults.map((s) => <ShowTile key={s.id} show={s} columns={cols} done={s.status === 'completed'} />)}
              </div>
            </>
          )}
          {tmdbSearching && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 18 }}>Searching TMDb&hellip;</div>}
          {/* Manual entry is the fallback when TMDb has nothing — offering it above the TMDb list
              steered people away from the option that brings cast, poster and seasons with it. */}
          {!tmdbSearching && tmdbResults.length === 0 && searchResults.length === 0 && (
            <div style={{ textAlign: 'center', padding: '28px 0 0' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 14 }}>Nothing found for &ldquo;{query}&rdquo;.</div>
              <button onClick={() => openAddShow()} style={{ height: 44, padding: '0 20px', border: 'none', borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>+ Add &ldquo;{query}&rdquo; manually</button>
            </div>
          )}
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

      {/**
        * What an account is and isn't, said before anyone wonders.
        *
        * Above the empty state rather than inside it, and in a card rather than a footnote: someone
        * opening the app for the first time has no way to know whether the "Sign in" in the corner
        * is required, what it would do with their data, or what happens if they ignore it. That
        * question arrives before "which show shall I add", so it is answered first — and the honest
        * answer is reassuring, which makes burying it the wrong call.
        *
        * The card is the same shape as the backup nudge below, which is the established way this
        * screen speaks in its own voice rather than showing content. The two never appear together:
        * this needs an empty library, that one needs eight records.
        *
        * Three tiers inside it, because a flat paragraph makes the reader work out what matters.
        * The heading is the answer, the first line is what staying signed out means, the last is
        * what changes if you don't — visibly quieter, because it is an option and not a warning.
        *
        * Every clause is checkable: the app runs on localStorage without an account, sign-in is a
        * magic link with no password field anywhere, and what syncs is the records you write.
        */}
      {!isSearching && data.shows.length === 0 && !session && isSyncConfigured() && (
        <div style={{ background: 'var(--card)', boxShadow: 'var(--shadow-card)', borderRadius: 18, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>No account needed</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Everything works signed out. Your library is stored in this browser rather than on a
            server, so clearing your browser data would erase it — you can export a backup file from
            Settings at any time.
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--divider)' }}>
            <strong style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>If you do sign in,</strong>{' '}
            your shows and the characters you write are saved to your account and appear on your
            other devices. It&rsquo;s an email link — no password.
          </div>
        </div>
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
                  <h2 className="ct-eyebrow" style={{ marginBottom: 0, marginTop: 0 }}>Currently watching</h2>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700 }}>{currentShows.length}</span>
                </div>
                <DensityToggle value={cols} options={[2, 3, 4]} onChange={setShowColumns} label="Show columns" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 26 }}>
                {currentShows.map((s) => <ShowTile key={s.id} show={s} columns={cols} />)}
                {currentShows.length === 0 && <div style={{ gridColumn: '1 / -1', padding: 18, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, border: '1px dashed var(--border)', borderRadius: 14 }}>Nothing in progress.</div>}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className="ct-eyebrow" style={{ marginBottom: 0, marginTop: 0 }}>Completed</h2>
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
