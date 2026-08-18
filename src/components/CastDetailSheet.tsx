import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { initials, bgStyle, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { getPersonCredits, getPersonWikiImdb, type PersonCredit } from '../lib/tmdb';
import { fetchEnrichment, type EnrichmentState } from '../lib/enrichment/client';
import type { RoleTag } from '../lib/enrichment/types';
import type { PhotoCrop } from '../types';
import CropModal from './CropModal';
import Sheet from './Sheet';

// Softer, sentence-case field labels — less shouting for a glanceable sheet
const fieldLabel: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };
const fieldValue: CSSProperties = { fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 };

const roleLabel: Record<RoleTag, string> = {
  main: 'Main',
  supporting: 'Supporting',
  recurring: 'Recurring',
  guest: 'Guest',
};

export default function CastDetailSheet() {
  const { showById, updateData } = useStore();
  const { activeShowId, castDetailId, closeCastDetail, openEditCast, openCastDetail, openShareSheet, openWebView } = useUI();
  const { shareCast } = useStore();
  const show = showById(activeShowId);
  const c = show?.cast.find((x) => x.id === castDetailId);

  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [notesEditing, setNotesEditing] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [creditsExpanded, setCreditsExpanded] = useState(false);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [credits, setCredits] = useState<PersonCredit[]>([]);
  const [bio, setBio] = useState<EnrichmentState>({ status: 'idle' });
  const [bioAttempt, setBioAttempt] = useState(0);
  const [lookedUpImdbUrl, setLookedUpImdbUrl] = useState<string | null>(null);
  const [akaEditing, setAkaEditing] = useState(false);
  const [akaDraft, setAkaDraft] = useState('');
  const [nickEditing, setNickEditing] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const [crop, setCrop] = useState<{ file: File | null; src: string | null }>({ file: null, src: null });
  const [descEditing, setDescEditing] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [whoEditing, setWhoEditing] = useState(false);
  const [whoDraft, setWhoDraft] = useState('');
  const [bioExpanded, setBioExpanded] = useState(false);
  const [bioOverflows, setBioOverflows] = useState(false);
  const bioRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveVersionId(null);
    setNotesEditing(false);
    setCreditsExpanded(false);
    setCredits([]);
    setBioAttempt(0);
    setLookedUpImdbUrl(null);
    setBioExpanded(false);
    setAkaEditing(false);
    setAkaDraft('');
    setNickEditing(false);
    setNickDraft('');
    setDescEditing(false);
    setDescDraft('');
    setCrop({ file: null, src: null });
    setWhoEditing(false);
    setWhoDraft('');
  }, [castDetailId]);

  /**
   * Only offer the toggle when the text is actually clipped. A "Show more" on a bio that already
   * fits is the classic version of this control done badly — it promises hidden content and then
   * reveals nothing.
   *
   * Measured only while collapsed: expanded, scrollHeight equals clientHeight, so re-measuring
   * would conclude there's no overflow and the "Show less" affordance would vanish under the
   * user's finger. Layout effect so the measurement lands before paint and the button doesn't
   * flicker in.
   */
  useLayoutEffect(() => {
    if (bio.status !== 'ready') { setBioOverflows(false); return; }
    const el = bioRef.current;
    if (!el || bioExpanded) return;
    // Width, not height: collapsed, the bio is a single nowrap line, so the text that doesn't fit
    // overflows horizontally. Measuring height here would always report no overflow and the toggle
    // would never appear.
    setBioOverflows(el.scrollWidth > el.clientWidth + 1);
  }, [bio, bioExpanded]);

  /**
   * Generation happens here and nowhere else — one character, on open. A first view costs a few
   * seconds while the server writes it; everyone after that, on any device, gets it from the
   * shared cache.
   */
  const showTmdbId = show?.tmdbId ?? null;
  const characterName = c?.name ?? '';
  const bioActorId = c?.actorTmdbId ?? null;
  const showTitle = show?.title ?? '';

  useEffect(() => {
    if (!castDetailId || !characterName) return;
    let cancelled = false;
    setBio({ status: 'loading' });
    fetchEnrichment({ showTmdbId, showTitle, characterName, actorTmdbId: bioActorId }).then((next) => {
      // Closing the sheet or jumping to another character mid-flight must not write stale state.
      if (!cancelled) setBio(next);
    });
    return () => { cancelled = true; };
  }, [castDetailId, characterName, showTmdbId, showTitle, bioActorId, bioAttempt]);

  /**
   * Resolve the actor's real IMDb page from their TMDb id. Version-aware, because a "young Tony"
   * version can be played by a different actor than the present-day one.
   */
  const lookupActorId =
    (activeVersionId ? c?.versions.find((v) => v.id === activeVersionId)?.actorTmdbId : c?.actorTmdbId) ?? null;

  useEffect(() => {
    setLookedUpImdbUrl(null);
    if (!lookupActorId) return;
    let cancelled = false;
    getPersonWikiImdb(lookupActorId)
      .then((r) => { if (!cancelled) setLookedUpImdbUrl(r?.imdbUrl ?? null); })
      .catch(() => { /* no link is a fine outcome — the pill just doesn't render */ });
    return () => { cancelled = true; };
  }, [lookupActorId]);

  if (!show || !c) return null;

  const activeVersion = activeVersionId ? c.versions.find((v) => v.id === activeVersionId) : null;
  const isDrama = show.type === 'DRAMA';

  const actorName = activeVersion?.actorName || c.actorName;
  const social = activeVersion?.social || c.social;
  const socialPlatform = activeVersion?.socialPlatform || c.socialPlatform;
  const wikiUrl = activeVersion?.wikiUrl || c.wikiUrl;
  const imdbUrl = activeVersion?.imdbUrl || c.imdbUrl;
  const actorTmdbId = activeVersion?.actorTmdbId ?? c.actorTmdbId;

  /**
   * These links used to appear only for hand-entered cast, because wikiUrl/imdbUrl are written
   * solely by the Add-cast form — anything imported from TMDb arrived with both blank, which is
   * every character in a library built by searching. Resolved on the fly instead.
   *
   * A typed-in link always wins: the user picked that one deliberately.
   *
   * IMDb is exact, from TMDb's external_ids. Wikipedia is a name-guess — TMDb doesn't carry a
   * Wikipedia link, and the same guess is already how show-level wiki links are built. It lands on
   * the right article for most actors and on a search-style miss for the rest, which is why it's
   * offered as a link to follow rather than presented as verified.
   */
  /**
   * The user's own alternate names first — they typed those deliberately — then any the source
   * turned up that aren't already listed. Compared case-insensitively so "Tony" and "tony" don't
   * both appear.
   */
  const akaNames = (() => {
    const own = c.otherNames.filter((n) => n.trim());
    const seen = new Set([c.name.trim().toLowerCase(), ...own.map((n) => n.trim().toLowerCase())]);
    const found = (bio.status === 'ready' ? bio.data.aliases : []).filter((a) => {
      const k = a.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return [...own, ...found];
  })();

  const effectiveImdbUrl = imdbUrl || lookedUpImdbUrl;
  const effectiveWikiUrl =
    wikiUrl || (actorName ? `https://en.wikipedia.org/wiki/${encodeURIComponent(actorName.replace(/ /g, '_'))}` : '');
  const hasActorInfo = !!(actorName || social || effectiveWikiUrl || effectiveImdbUrl);

  const toggleCredits = () => {
    const next = !creditsExpanded;
    setCreditsExpanded(next);
    if (next && credits.length === 0 && actorTmdbId) {
      setCreditsLoading(true);
      getPersonCredits(actorTmdbId).then((list) => { setCredits(list); setCreditsLoading(false); }).catch(() => setCreditsLoading(false));
    }
  };

  /**
   * Adds one alternate name in place. Previously this closed the sheet and opened the edit form,
   * which is a lot of ceremony for one short string — and it dropped the user out of the page
   * they were reading to do it.
   *
   * Silently ignores a name already on the record, or the character's own name, rather than
   * erroring: the user's intent is satisfied either way, and a validation message here would be
   * louder than the thing it's complaining about.
   */
  const saveAka = () => {
    const value = akaDraft.trim();
    setAkaEditing(false);
    setAkaDraft('');
    if (!value) return;
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const cc = s?.cast.find((x) => x.id === c.id);
      if (!cc) return;
      const existing = [cc.name, ...(cc.otherNames || [])].map((n) => n.trim().toLowerCase());
      if (existing.includes(value.toLowerCase())) return;
      cc.otherNames = [...(cc.otherNames || []), value];
    });
  };

  /**
   * Same inline pattern as the AKA field, but the nickname is a single value rather than a list,
   * so saving replaces it and saving an empty field clears it — that's the only way to remove one
   * without opening the full form.
   */
  const saveNickname = () => {
    const value = nickDraft.trim();
    setNickEditing(false);
    setNickDraft('');
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const cc = s?.cast.find((x) => x.id === c.id);
      if (cc) cc.nickname = value;
    });
  };

  /**
   * Same reframe control as the Character Details form, so a photo can be adjusted from the page
   * you're already looking at instead of a round trip through the editor.
   *
   * A reframe returns framing only and leaves the source image alone; an upload also returns a
   * downscaled copy of the whole picture. Writes to the base character, so it's suppressed while a
   * version is selected — versions carry their own photo and editing here would change the wrong
   * one.
   */
  const confirmCrop = ({ dataUrl, crop: framing }: { dataUrl?: string; crop: PhotoCrop }) => {
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const cc = s?.cast.find((x) => x.id === c.id);
      if (!cc) return;
      if (dataUrl) cc.photo = dataUrl;
      cc.photoCrop = framing;
    });
    setCrop({ file: null, src: null });
  };

  /** Single line, so Enter commits — same as the AKA and nickname fields. */
  const saveWho = () => {
    const value = whoDraft.trim();
    setWhoEditing(false);
    setWhoDraft('');
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const cc = s?.cast.find((x) => x.id === c.id);
      if (cc) cc.whoTheyAre = value;
    });
  };

  /** Multi-line, so Enter inserts a newline rather than committing — Save is the only commit. */
  const saveDesc = () => {
    const value = descDraft.trim();
    setDescEditing(false);
    setDescDraft('');
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      const cc = s?.cast.find((x) => x.id === c.id);
      if (cc) cc.desc = value;
    });
  };

  const startNotesEdit = () => { setNotesDraft(c.notes || ''); setNotesEditing(true); };
  const saveNotes = () => {
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); const cc = s?.cast.find((x) => x.id === c.id); if (cc) cc.notes = notesDraft.trim(); });
    setNotesEditing(false);
  };

  const relatedList = (c.relationships || []).map((r) => ({ rel: r, target: show.cast.find((x) => x.id === r.targetId) })).filter((x) => x.target);

  const termLower = isDrama ? 'character' : 'contestant';
  const deleteCast = () => {
    if (!window.confirm(`Delete this ${termLower}?`)) return;
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) s.cast = s.cast.filter((x) => x.id !== c.id); });
    closeCastDetail();
  };

  return (
    <Sheet onClose={closeCastDetail} label={c.name}>
        <button onClick={() => { closeCastDetail(); openEditCast(c.id); }} style={{ position: 'absolute', right: 58, top: 16, width: 32, height: 32, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.7 12l-2.9.7.7-2.9 7.8-7.5z" stroke="var(--text)" strokeWidth="1.3" strokeLinejoin="round" fill="none"></path></svg>
        </button>
        <button onClick={() => openShareSheet(shareCast(show.id, c.id))} style={{ position: 'absolute', right: 18, top: 16, width: 32, height: 32, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><path d="M5.7 7.1l4.6-3.2M5.7 8.9l4.6 3.2" stroke="var(--text)" strokeWidth="1.3" /></svg>
        </button>

        {/* Clears the edit and share buttons by starting below them rather than by reserving a
            column beside them.

            Those buttons are absolutely positioned over this row, ending 48px down the sheet. This
            row used to begin at 34px and carry 84px of right padding so a long name didn't run
            underneath them — which cost every line in this block 84px of width, on the narrowest
            screen, for the sake of the two rows that were actually at risk. Starting at 56px
            instead costs 22px of height once and gives the name, the AKA list, the nickname and
            who-they-are the full width of the sheet.

            40 and not 22: this margin collapses with the grabber's 18px bottom margin rather than
            adding to it, so the larger of the two is what you get. */}
        <div style={{ display: 'flex', gap: 14, marginTop: 40, marginBottom: 16 }}>
          {/* Matches the Character Details form: tapping the tile reframes the existing photo, the
              pencil badge picks a new one. `overflow: hidden` has to go — it clipped the badge,
              which hangs off the corner — so the rounded corners come from the tile's own radius
              on the background image instead.

              Suppressed while a version is selected: this writes to the base character, and a
              version carries its own photo. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 'none' }}>
            <div
              onClick={() => { if (!activeVersion && displayPhoto(c)) setCrop({ file: null, src: displayPhoto(c) }); }}
              role={!activeVersion && displayPhoto(c) ? 'button' : undefined}
              aria-label={!activeVersion && displayPhoto(c) ? 'Reframe photo' : undefined}
              title={!activeVersion && displayPhoto(c) ? 'Reframe photo' : undefined}
              style={{ position: 'relative', width: 84, height: 84, borderRadius: 18, flex: 'none', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !activeVersion && displayPhoto(c) ? 'pointer' : 'default', ...cropStyle(activeVersion?.photo || displayPhoto(c), activeVersion ? null : c.photoCrop) }}
            >
              {!(activeVersion?.photo || displayPhoto(c)) && <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(activeVersion?.name || c.name)}</span>}
              {!activeVersion && (
                <label style={{ position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 999, background: 'var(--accent)', border: '2px solid var(--sheet)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) setCrop({ file: f, src: null }); }} style={{ display: 'none' }} />
                </label>
              )}
            </div>
            {!activeVersion && displayPhoto(c) && (
              <button onClick={() => setCrop({ file: null, src: displayPhoto(c) })} style={{ border: 'none', background: 'none', padding: 0, marginTop: 4, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-soft)' }}>Reframe</button>
            )}
          </div>
          {/* Top-aligned with the photo rather than centred against it. Centring left the name
              floating in the middle of an 84px block whenever there was no AKA or nickname to
              balance it, which read as a layout accident rather than a choice. */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 2 }}>
            <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{activeVersion?.name || c.name}</div>
            {akaNames.length > 0 && (
              <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 3 }}>
                <span style={{ fontWeight: 700 }}>AKA</span> {akaNames.join(', ')}
                {/* Once there's a list, the full "+ Add other names they go by" sentence is
                    redundant — the line above it already says what these are. A plus after the
                    last name says the same thing in one character and keeps the header to one
                    line. Padding plus a cancelling negative margin gives it a real tap target
                    without pushing the line apart. */}
                {!akaEditing && (
                  <button
                    onClick={() => setAkaEditing(true)}
                    aria-label="Add another name"
                    style={{ border: 'none', background: 'none', padding: '6px 6px', margin: '-6px -2px', cursor: 'pointer', fontSize: 15, fontWeight: 700, lineHeight: 1, color: 'var(--accent-soft)', verticalAlign: 'baseline' }}
                  >
                    +
                  </button>
                )}
              </div>
            )}
            {/* Always offered, not just when the list is empty. Names found in the source are
                suggestions; the user still needs a way to add the ones only they know — a fan
                nickname, what their household calls the character. Same wording as the Add-cast
                form so the two read as one feature. */}
            {akaEditing ? (
              <div style={{ marginTop: 5 }}>
                <input
                  autoFocus
                  value={akaDraft}
                  onChange={(e) => setAkaDraft(e.target.value)}
                  // Enter to commit, Escape to abandon — the shortcuts a one-field form implies.
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveAka();
                    if (e.key === 'Escape') { e.stopPropagation(); setAkaEditing(false); setAkaDraft(''); }
                  }}
                  placeholder="Another name they go by"
                  className="ct-input"
                  style={{ height: 34, fontSize: 13, marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setAkaEditing(false); setAkaDraft(''); }} style={{ flex: 1, height: 30, border: '1px solid var(--input-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveAka} style={{ flex: 1, height: 30, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            ) : akaNames.length === 0 ? (
              <button
                onClick={() => setAkaEditing(true)}
                // Matched to the identical button on the Character Details form: same accent, size
                // and weight, so the two read as one control in two places rather than two controls.
                style={{ display: 'block', border: 'none', background: 'none', padding: '3px 0 0', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}
              >
                + Add other names they go by
              </button>
            ) : null}
            {/* A version carries its own nickname, so while one is selected this stays read-only —
                editing here would write to the base character and silently contradict what's on
                screen. Reordering, deleting and per-version edits all live in the full form. */}
            {activeVersion ? (
              activeVersion.nickname ? <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4 }}>&ldquo;{activeVersion.nickname}&rdquo;</div> : null
            ) : nickEditing ? (
              <div style={{ marginTop: 5 }}>
                <input
                  autoFocus
                  value={nickDraft}
                  onChange={(e) => setNickDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNickname();
                    if (e.key === 'Escape') { e.stopPropagation(); setNickEditing(false); setNickDraft(''); }
                  }}
                  placeholder={`What do you call this ${termLower}?`}
                  className="ct-input"
                  style={{ height: 34, fontSize: 13, marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setNickEditing(false); setNickDraft(''); }} style={{ flex: 1, height: 30, border: '1px solid var(--input-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveNickname} style={{ flex: 1, height: 30, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            ) : c.nickname ? (
              // Tapping the nickname reopens it prefilled — the only affordance for changing or
              // clearing one without a trip through the full form.
              <button
                onClick={() => { setNickDraft(c.nickname); setNickEditing(true); }}
                style={{ display: 'block', border: 'none', background: 'none', padding: '4px 0 0', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontStyle: 'italic', color: 'var(--accent-soft)' }}
              >
                &ldquo;{c.nickname}&rdquo;
              </button>
            ) : (
              <button
                onClick={() => { setNickDraft(''); setNickEditing(true); }}
                style={{ display: 'block', border: 'none', background: 'none', padding: '3px 0 0', textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}
              >
                + Add your nickname for this {termLower}
              </button>
            )}
          </div>
        </div>

        {c.versions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
            <button onClick={() => setActiveVersionId(null)} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', outline: `2px solid ${!activeVersionId ? 'var(--accent)' : 'transparent'}`, ...cropStyle(displayPhoto(c), c.photoCrop) }}>
                {!displayPhoto(c) && <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(c.name)}</span>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: !activeVersionId ? 'var(--accent-soft)' : 'var(--text-muted)', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Present</span>
            </button>
            {c.versions.map((v) => (
              <button key={v.id} onClick={() => setActiveVersionId(v.id)} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', outline: `2px solid ${activeVersionId === v.id ? 'var(--accent)' : 'transparent'}`, ...bgStyle(v.photo, '100% auto', 'center') }}>
                  {!v.photo && <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-muted)' }}>{initials(v.name)}</span>}
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: activeVersionId === v.id ? 'var(--accent-soft)' : 'var(--text-muted)', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.age || v.name || 'Version'}</span>
              </button>
            ))}
          </div>
        )}

        {/* The user's own answer to "who is this?", above what they look like: a role or a
            relationship identifies someone faster than a description of their face, and unlike the
            generated bio it's in their words. Read-only while a version is selected, matching the
            two fields below — versions carry their own values for those. */}
        {!activeVersion && (
          <div style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>Who they are</div>
            {whoEditing ? (
              <>
                <input
                  autoFocus
                  value={whoDraft}
                  onChange={(e) => setWhoDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveWho();
                    if (e.key === 'Escape') { e.stopPropagation(); setWhoEditing(false); setWhoDraft(''); }
                  }}
                  placeholder="Meadow's boyfriend, the family lawyer&hellip;"
                  className="ct-input"
                  style={{ height: 34, fontSize: 13.5, marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setWhoEditing(false); setWhoDraft(''); }} style={{ flex: 1, height: 30, border: '1px solid var(--input-border)', borderRadius: 8, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveWho} style={{ flex: 1, height: 30, border: 'none', borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </>
            ) : c.whoTheyAre ? (
              <button
                onClick={() => { setWhoDraft(c.whoTheyAre || ''); setWhoEditing(true); }}
                style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}
              >
                {c.whoTheyAre}
              </button>
            ) : (
              <button
                onClick={() => { setWhoDraft(''); setWhoEditing(true); }}
                style={{ display: 'block', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}
              >
                + Add who they are
              </button>
            )}
          </div>
        )}

        {/* Sits directly under the header because it answers "who is this?" — the question the
            sheet is opened to answer. Absent entirely when there's no source, rather than showing
            a permanent empty state on the many characters nobody has written about. */}
        {activeVersion ? (
          activeVersion.desc ? (
            <>
              <div style={fieldLabel}>Visual description</div>
              <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>{activeVersion.desc}</div>
            </>
          ) : null
        ) : (
          <div style={{ marginBottom: 16 }}>
            <div style={fieldLabel}>Visual description</div>
            {descEditing ? (
              <>
                <textarea
                  autoFocus
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  // No Enter-to-commit here: this is the one field where a line break is plausible
                  // content, so Enter has to mean Enter. Escape still abandons.
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setDescEditing(false); setDescDraft(''); } }}
                  placeholder="Chunky glasses, pink hat, high cheekbones&hellip;"
                  className="ct-textarea"
                  style={{ minHeight: 60, fontSize: 13.5, marginBottom: 6 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setDescEditing(false); setDescDraft(''); }} style={{ flex: 1, height: 34, border: '1px solid var(--input-border)', borderRadius: 9, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveDesc} style={{ flex: 1, height: 34, border: 'none', borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </>
            ) : c.desc ? (
              // The description itself is the control, as with the nickname — tapping it reopens
              // the field prefilled, and saving it empty clears it.
              <button
                onClick={() => { setDescDraft(c.desc); setDescEditing(true); }}
                style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}
              >
                {c.desc}
              </button>
            ) : (
              <button
                onClick={() => { setDescDraft(''); setDescEditing(true); }}
                style={{ display: 'block', border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}
              >
                + Add a visual description
              </button>
            )}
          </div>
        )}

        {/* Empty fields are omitted rather than shown as a dash — a dash reads as a failed load. */}
        {bio.status !== 'unavailable' && bio.status !== 'idle' && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <div style={{ ...fieldLabel, marginBottom: 0 }}>Bio</div>
              {bio.status === 'ready' && (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--accent-soft)', background: 'color-mix(in oklch, var(--accent-soft) 12%, transparent)', padding: '2px 7px', borderRadius: 999 }}>
                  {roleLabel[bio.data.roleTag]}
                </span>
              )}
            </div>

            {bio.status === 'loading' && (
              <div style={{ fontSize: 13.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>Writing a short bio&hellip;</div>
            )}

            {bio.status === 'ready' && (
              <>
                {/* Collapsed, the text and its toggle share one line: on a phone the bio sits
                    above everything the sheet exists to show, so a second line spent on a control
                    is a line of someone's notes pushed off screen.

                    Ellipsis truncation rather than line-clamp here, because clamping to one line
                    still reserves the full row for the text and leaves nowhere for the button to
                    sit beside it. The full string stays in the DOM either way. */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <div
                    ref={bioRef}
                    style={{
                      flex: 1,
                      minWidth: 0, // without this a flex child refuses to shrink below its text width
                      fontSize: 13.5,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.5,
                      ...(bioExpanded ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }),
                    }}
                  >
                    {bio.data.bio}
                  </div>
                  {bioOverflows && !bioExpanded && (
                    <button
                      onClick={() => setBioExpanded(true)}
                      aria-expanded={false}
                      // Negative margin cancels the padding's effect on layout, so the tap target is
                      // ~28px tall while the label still sits on the bio's baseline.
                      style={{ flex: 'none', border: 'none', background: 'none', padding: '6px 0', margin: '-6px 0', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)', whiteSpace: 'nowrap' }}
                    >
                      Show more
                    </button>
                  )}
                </div>
                {/* Expanded, the paragraph is already many lines — the toggle moves below it rather
                    than floating beside the first line. */}
                {bioOverflows && bioExpanded && (
                  <button
                    onClick={() => setBioExpanded(false)}
                    aria-expanded
                    style={{ display: 'block', border: 'none', background: 'none', padding: '4px 0', marginTop: 1, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)', textAlign: 'left', minHeight: 28 }}
                  >
                    Show less
                  </button>
                )}
                {/* Said plainly, because a summary a machine wrote from one source shouldn't be
                    mistaken for something the user wrote or for an authoritative fact. */}
                <button
                  onClick={() => openWebView(bio.data.sourceUrl, 'Wikipedia')}
                  style={{ display: 'block', border: 'none', background: 'none', padding: '5px 0 0', cursor: 'pointer', fontSize: 12, color: 'var(--text-faint)', textAlign: 'left' }}
                >
                  AI summary of its <span style={{ textDecoration: 'underline' }}>Wikipedia page</span>
                </button>
              </>
            )}

            {bio.status === 'error' && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>Couldn&rsquo;t generate a bio right now.</span>
                <button onClick={() => setBioAttempt((n) => n + 1)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--accent-soft)' }}>Try again</button>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(c.age || c.hometown) && (
            <div style={{ display: 'grid', gridTemplateColumns: c.age && c.hometown ? '1fr 1fr' : '1fr', gap: 14 }}>
              {c.age && <div><div style={fieldLabel}>Age</div><div style={fieldValue}>{c.age}</div></div>}
              {c.hometown && <div><div style={fieldLabel}>Hometown</div><div style={fieldValue}>{c.hometown}</div></div>}
            </div>
          )}
          {c.occupation && <div><div style={fieldLabel}>Occupation</div><div style={fieldValue}>{c.occupation}</div></div>}
          {/* Relationships sit with the other facts about the character rather than above the
              bio. They're also the sheet's only navigation — each one opens that character. The
              wrapper drops the old marginBottom; this column's gap handles the spacing now. */}
          {relatedList.length > 0 && (
            <div>
              <div style={{ ...fieldLabel, marginBottom: 6 }}>Related to</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {relatedList.map(({ rel, target }) => (
                  <button key={rel.id} onClick={() => openCastDetail(target!.id)} style={{ display: 'flex', alignItems: 'baseline', gap: 6, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-soft)' }}>{target!.name}</span>
                    <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>&middot; {rel.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* The "Added from" row lived here. `firstEp` and `season` are still recorded on
              import and still drive the season filter — this only stops showing them on the
              character. Both remain editable in the Character Details form. */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <div style={{ ...fieldLabel, marginBottom: 0 }}>Notes</div>
              {!notesEditing && <button onClick={startNotesEdit} style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinejoin="round" /></svg></button>}
            </div>
            {notesEditing ? (
              <>
                <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder="Add a quick note&hellip;" className="ct-textarea" style={{ minHeight: 60, fontSize: 13.5, marginBottom: 6 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setNotesEditing(false)} style={{ flex: 1, height: 34, border: '1px solid var(--input-border)', borderRadius: 9, background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveNotes} style={{ flex: 1, height: 34, border: 'none', borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </>
            ) : (
              c.notes
                ? <div style={fieldValue}>{c.notes}</div>
                : <button onClick={startNotesEdit} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 14, color: 'var(--text-faint)' }}>Add a note</button>
            )}
          </div>
          {(c.customFields || []).filter((cf) => cf.value).map((cf) => (
            <div key={cf.id}>
              <div style={fieldLabel}>{cf.label || 'Untitled'}</div>
              <div style={fieldValue}>{cf.value}</div>
            </div>
          ))}
        </div>

        {hasActorInfo && (
          <div style={{ marginTop: 20, padding: '16px 14px', borderRadius: 14, background: 'color-mix(in oklch, var(--accent-soft) 8%, transparent)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 14, borderRadius: 2, background: 'var(--accent-soft)' }} />
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--accent-soft)' }}>{isDrama ? 'About the actor' : 'More'}</div>
            </div>
            {isDrama && <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: -8 }}>Real-world info — separate from the character</div>}
            {isDrama && actorName && (
              <div><div style={fieldLabel}>Actor name</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{actorName}</div></div>
            )}
            {social && (
              <div><div style={fieldLabel}>Social</div><div style={{ fontSize: 13, color: 'var(--accent-soft)' }}>{socialPlatform} &middot; {social}</div></div>
            )}
            {(effectiveWikiUrl || effectiveImdbUrl) && (
              <div>
                <div style={{ ...fieldLabel, marginBottom: 6 }}>Read more about them</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {effectiveWikiUrl && <button className="ct-pill" style={{ padding: '8px 14px' }} onClick={() => openWebView(effectiveWikiUrl, 'Wikipedia')}>Wikipedia</button>}
                  {effectiveImdbUrl && <button className="ct-pill" style={{ padding: '8px 14px' }} onClick={() => openWebView(effectiveImdbUrl, 'IMDb')}>IMDb</button>}
                </div>
              </div>
            )}
            {actorTmdbId && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 2 }}>
                <button onClick={toggleCredits} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ ...fieldLabel, flex: 1, marginBottom: 0 }}>Where else have I seen them?</span>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" style={{ transform: creditsExpanded ? 'rotate(180deg)' : 'none' }}><path d="M3 5.5L8 10.5L13 5.5" stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {creditsExpanded && (
                  creditsLoading ? (
                    <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>Looking up their credits&hellip;</div>
                  ) : credits.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                      {credits.map((cr, i) => (
                        <div key={i} style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>{cr.title}</span>
                          {cr.year && <span style={{ color: 'var(--text-muted)' }}> &middot; {cr.year}</span>}
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>
            )}
          </div>
        )}

        <button onClick={deleteCast} style={{ width: '100%', height: 40, border: 'none', background: 'transparent', color: '#E08A80', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}>Delete {termLower}</button>

        <CropModal
          file={crop.file}
          src={crop.src}
          initial={c.photoCrop ?? null}
          onCancel={() => setCrop({ file: null, src: null })}
          onConfirm={confirmCrop}
        />
    </Sheet>
  );
}