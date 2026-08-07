import { useEffect, useState, type CSSProperties } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { initials, bgStyle } from '../lib/utils';
import { getPersonCredits, type PersonCredit } from '../lib/tmdb';

// Softer, sentence-case field labels — less shouting for a glanceable sheet
const fieldLabel: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 };

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

  useEffect(() => {
    setActiveVersionId(null);
    setNotesEditing(false);
    setCreditsExpanded(false);
    setCredits([]);
  }, [castDetailId]);

  if (!show || !c) return null;

  const activeVersion = activeVersionId ? c.versions.find((v) => v.id === activeVersionId) : null;
  const isDrama = show.type === 'DRAMA';

  const actorName = activeVersion?.actorName || c.actorName;
  const social = activeVersion?.social || c.social;
  const socialPlatform = activeVersion?.socialPlatform || c.socialPlatform;
  const wikiUrl = activeVersion?.wikiUrl || c.wikiUrl;
  const imdbUrl = activeVersion?.imdbUrl || c.imdbUrl;
  const actorTmdbId = activeVersion?.actorTmdbId ?? c.actorTmdbId;
  const hasActorInfo = !!(actorName || social || wikiUrl || imdbUrl);

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
          <div style={{ position: 'relative', width: 84, height: 84, borderRadius: 18, flex: 'none', overflow: 'hidden', backgroundColor: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', ...bgStyle(activeVersion?.photo || c.photo, 'contain') }}>
            {!(activeVersion?.photo || c.photo) && <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(activeVersion?.name || c.name)}</span>}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2 }}>{activeVersion?.name || c.name}</div>
            {c.otherNames.length > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}><span style={{ fontWeight: 700 }}>AKA</span> {c.otherNames.join(', ')}</div>}
            {(activeVersion?.nickname || c.nickname) && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--accent-soft)', marginTop: 4 }}>&ldquo;{activeVersion?.nickname || c.nickname}&rdquo;</div>}
          </div>
        </div>

        {c.versions.length > 0 && (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', marginBottom: 16, paddingBottom: 2 }}>
            <button onClick={() => setActiveVersionId(null)} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: c.color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', outline: `2px solid ${!activeVersionId ? '#6366F1' : 'transparent'}`, ...bgStyle(c.photo, 'contain') }}>
                {!c.photo && <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--initials-tint)' }}>{initials(c.name)}</span>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: !activeVersionId ? 'var(--accent-soft)' : 'var(--text-muted)', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Present</span>
            </button>
            {c.versions.map((v) => (
              <button key={v.id} onClick={() => setActiveVersionId(v.id)} style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 'none', background: 'none', padding: 0, cursor: 'pointer' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'rgba(99,102,241,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', outline: `2px solid ${activeVersionId === v.id ? '#6366F1' : 'transparent'}`, ...bgStyle(v.photo, 'contain') }}>
                  {!v.photo && <span style={{ fontSize: 15, fontWeight: 800, color: 'rgba(99,102,241,0.8)' }}>{initials(v.name)}</span>}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: activeVersionId === v.id ? 'var(--accent-soft)' : 'var(--text-muted)', maxWidth: 52, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.age || v.name || 'Version'}</span>
              </button>
            ))}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div><div style={fieldLabel}>Age</div><div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{c.age || '—'}</div></div>
            <div><div style={fieldLabel}>Hometown</div><div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{c.hometown || '—'}</div></div>
          </div>
          <div><div style={fieldLabel}>Occupation</div><div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{c.occupation || '—'}</div></div>
          <div><div style={fieldLabel}>First seen</div><div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>{c.firstEp || '—'}</div></div>
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
                  <button onClick={saveNotes} style={{ flex: 1, height: 34, border: 'none', borderRadius: 9, background: '#6366F1', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.notes || '—'}</div>
            )}
          </div>
          {(c.customFields || []).map((cf) => (
            <div key={cf.id}>
              <div style={fieldLabel}>{cf.label || 'Untitled'}</div>
              <div style={{ fontSize: 14, color: 'var(--text-tertiary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{cf.value || '—'}</div>
            </div>
          ))}
        </div>

        {hasActorInfo && (
          <div style={{ marginTop: 20, padding: '16px 14px', borderRadius: 14, background: 'color-mix(in oklch, var(--accent-soft) 8%, transparent)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 14, borderRadius: 2, background: 'var(--accent-soft)' }} />
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.01em', color: 'var(--accent-soft)' }}>{isDrama ? 'About the actor' : 'More'}</div>
            </div>
            {isDrama && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8 }}>Real-world info — separate from the character</div>}
            {isDrama && actorName && (
              <div><div style={fieldLabel}>Actor name</div><div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{actorName}</div></div>
            )}
            {social && (
              <div><div style={fieldLabel}>Social</div><div style={{ fontSize: 13, color: 'var(--accent-soft)' }}>{socialPlatform} &middot; {social}</div></div>
            )}
            {(wikiUrl || imdbUrl) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {wikiUrl && <button className="ct-pill" style={{ padding: '8px 14px' }} onClick={() => openWebView(wikiUrl, 'Wikipedia')}>Wikipedia</button>}
                {imdbUrl && <button className="ct-pill" style={{ padding: '8px 14px' }} onClick={() => openWebView(imdbUrl, 'IMDb')}>IMDb</button>}
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
