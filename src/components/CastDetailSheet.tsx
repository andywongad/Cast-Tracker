import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { initials, bgStyle, cropStyle } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { getPersonCredits, getPersonWikiImdb, type PersonCredit } from '../lib/tmdb';
import { fetchEnrichment, type EnrichmentState } from '../lib/enrichment/client';
import type { RoleTag } from '../lib/enrichment/types';

// Softer, sentence-case field labels — less shouting for a glanceable sheet
const fieldLabel: CSSProperties = { fontSize: 13.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };
const fieldValue: CSSProperties = { fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 };

const roleLabel: Record<RoleTag, string> = {
  main: 'Main',
  supporting: 'Supporting',
  recurring: 'Recurring',
  guest: 'Guest',
};

function EditIcon() {
  return <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.7 12l-2.9.7.7-2.9 7.8-7.5z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" fill="none"></path></svg>;
}
function ShareIcon() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.8" stroke="#fff" strokeWidth="1.3" /><path d="M5.6 7.2l4.6-3.2M5.6 8.8l4.6 3.2" stroke="#fff" strokeWidth="1.3" /></svg>;
}

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
    setBioOverflows(el.scrollHeight > el.clientHeight + 1);
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
    <div className="ct-scrim" onClick={closeCastDetail}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <button onClick={() => { closeCastDetail(); openEditCast(c.id); }} style={{ position: 'absolute', right: 58, top: 16, width: 32, height: 32, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M11.3 2.3a1.5 1.5 0 0 1 2.1 2.1L5.7 12l-2.9.7.7-2.9 7.8-7.5z" stroke="var(--text)" strokeWidth="1.3" strokeLinejoin="round" fill="none"></path></svg>
        </button>
        <button onClick={() => openShareSheet(shareCast(show.id, c.id))} style={{ position: 'absolute', right: 18, top: 16, width: 32, height: 32, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="4" cy="8" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><circle cx="12" cy="3.5" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><circle cx="12" cy="12.5" r="1.9" stroke="var(--text)" strokeWidth="1.3" /><path d="M5.7 7.1l4.6-3.2M5.7 8.9l4.6 3.2" stroke="var(--text)" strokeWidth="1.3" /></svg>
        </button>

        <div style={{ display: 'flex', gap: 14, marginBottom: 16 }}>
          <div style={{ position: 'relative', width: 84, height: 84, borderRadius: 18, flex: 'none', overflow: 'hidden', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...cropStyle(activeVersion?.photo || displayPhoto(c), activeVersion ? null : c.photoCrop) }}>
            {!(activeVersion?.photo || displayPhoto(c)) && <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(activeVersion?.name || c.name)}</span>}
          </div>
          {/* Top-aligned with the photo rather than centred against it. Centring left the name
              floating in the middle of an 84px block whenever there was no AKA or nickname to
              balance it, which read as a layout accident rather than a choice. */}
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', paddingTop: 2 }}>
            <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{activeVersion?.name || c.name}</div>
            {c.otherNames.length > 0 ? (
              <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 3 }}><span style={{ fontWeight: 700 }}>AKA</span> {c.otherNames.join(', ')}</div>
            ) : (
              /* Same wording as the Add-cast form, so the two read as one feature rather than two.
                 Sits where the AKA line will appear once names exist. */
              <button
                onClick={() => { closeCastDetail(); openEditCast(c.id); }}
                style={{ border: 'none', background: 'none', padding: '3px 0 0', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: 'var(--text-faint)' }}
              >
                + Add other names they go by
              </button>
            )}
            {(activeVersion?.nickname || c.nickname) && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4 }}>&ldquo;{activeVersion?.nickname || c.nickname}&rdquo;</div>}
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

        {/* Sits directly under the header because it answers "who is this?" — the question the
            sheet is opened to answer. Absent entirely when there's no source, rather than showing
            a permanent empty state on the many characters nobody has written about. */}
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
                {/* Clamped to three lines rather than truncated with an ellipsis mid-sentence:
                    line-clamp cuts on a line boundary, so the visible part still reads as prose.
                    The full text stays in the DOM, so find-in-page and screen readers reach it. */}
                <div
                  ref={bioRef}
                  style={{
                    fontSize: 13.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    ...(bioExpanded
                      ? {}
                      : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 3, overflow: 'hidden' }),
                  }}
                >
                  {bio.data.bio}
                </div>
                {bioOverflows && (
                  <button
                    onClick={() => setBioExpanded((v) => !v)}
                    aria-expanded={bioExpanded}
                    // 44px of vertical reach on a control whose text is only ~16px tall — the label
                    // stays tight to the bio, the tap target doesn't.
                    style={{ display: 'block', border: 'none', background: 'none', padding: '4px 0', marginTop: 1, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)', textAlign: 'left', minHeight: 28 }}
                  >
                    {bioExpanded ? 'Show less' : 'Show more'}
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

        {relatedList.length > 0 && (
          <>
            <div style={{ ...fieldLabel, marginBottom: 6 }}>Related to</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {relatedList.map(({ rel, target }) => (
                <button key={rel.id} onClick={() => openCastDetail(target!.id)} style={{ display: 'flex', alignItems: 'baseline', gap: 6, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-soft)' }}>{target!.name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>&middot; {rel.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {(activeVersion?.desc || c.desc) && (
          <>
            <div style={fieldLabel}>Visual description</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 16 }}>{activeVersion?.desc || c.desc}</div>
          </>
        )}

        {/* Empty fields are omitted rather than shown as a dash — a dash reads as a failed load. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {(c.age || c.hometown) && (
            <div style={{ display: 'grid', gridTemplateColumns: c.age && c.hometown ? '1fr 1fr' : '1fr', gap: 14 }}>
              {c.age && <div><div style={fieldLabel}>Age</div><div style={fieldValue}>{c.age}</div></div>}
              {c.hometown && <div><div style={fieldLabel}>Hometown</div><div style={fieldValue}>{c.hometown}</div></div>}
            </div>
          )}
          {c.occupation && <div><div style={fieldLabel}>Occupation</div><div style={fieldValue}>{c.occupation}</div></div>}
          {c.firstEp && (
            <div>
              {/* "Added from", not "First seen": this records the episode the character was
                  imported from, which is only their true first appearance if you imported
                  chronologically. Claiming the stronger thing was wrong — Tony Soprano is in
                  the pilot but read "First seen Ep 8" after a season 5 import. */}
              <div style={fieldLabel}>Added from</div>
              <div style={fieldValue}>{c.season ? `Season ${c.season} \u00b7 ${c.firstEp}` : c.firstEp}</div>
            </div>
          )}
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
      </div>
    </div>
  );
}
