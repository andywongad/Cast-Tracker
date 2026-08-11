import { useEffect, useMemo, useState, useRef } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import type { CastVersion, Relationship, Gender, CustomField } from '../types';
import { bgStyle, genId, initials, colorForIndex } from '../lib/utils';
import { displayPhoto } from '../lib/tvmaze';
import { getAggregateCredits, getEpisodeCredits, getSeasonEpisodeCount, hasTmdbKey, type AggregateCastMember } from '../lib/tmdb';
import CropModal from './CropModal';
import EditControls from './EditControls';

const SOCIAL_PLATFORMS = ['Instagram', 'TikTok', 'X', 'YouTube', 'Facebook', 'Snapchat', 'Other'];

type OptionalField = 'versions' | 'relationships' | 'gender' | 'age' | 'hometown' | 'occupation' | 'firstEp' | 'customFields';

const OPTIONAL_FIELDS: { key: OptionalField; label: string }[] = [
  { key: 'versions', label: 'Other versions (young / teen)' },
  { key: 'relationships', label: 'Related to' },
  { key: 'gender', label: 'Gender' },
  { key: 'age', label: 'Age' },
  { key: 'hometown', label: 'Hometown' },
  { key: 'occupation', label: 'Occupation' },
  { key: 'firstEp', label: 'First seen' },
  { key: 'customFields', label: 'Add your own…' },
];

interface FormState {
  name: string;
  otherNames: string[];
  nickname: string;
  desc: string;
  photo: string | null;
  gender: Gender;
  age: string;
  hometown: string;
  occupation: string;
  notes: string;
  firstEp: string;
  season: number;
  actorName: string;
  actorTmdbId: number | null;
  social: string;
  socialPlatform: string;
  wikiUrl: string;
  imdbUrl: string;
  versions: CastVersion[];
  relationships: Relationship[];
  customFields: CustomField[];
  activeFields: OptionalField[];
}

function blankForm(season: number): FormState {
  return {
    name: '', otherNames: [], nickname: '', desc: '', photo: null, gender: '', age: '', hometown: '', occupation: '',
    notes: '', firstEp: '', season, actorName: '', actorTmdbId: null, social: '', socialPlatform: 'Instagram',
    wikiUrl: '', imdbUrl: '', versions: [], relationships: [], customFields: [], activeFields: [],
  };
}

/** The shape actually written to storage — trimmed, with blank rows dropped. */
function toSavedFields(f: FormState) {
  return {
    name: f.name.trim(), native: '', nickname: f.nickname.trim(), otherNames: f.otherNames.map((s) => s.trim()).filter(Boolean),
    desc: f.desc.trim(), photo: f.photo, notes: f.notes.trim(), versions: f.versions,
    relationships: f.relationships.filter((r) => r.targetId && r.label.trim()).map((r) => ({ ...r, label: r.label.trim() })),
    customFields: f.customFields.map((cf) => ({ ...cf, label: cf.label.trim(), value: cf.value.trim() })).filter((cf) => cf.label || cf.value),
    shownFields: [...f.activeFields],
    gender: f.gender, age: f.age.trim(), hometown: f.hometown.trim(), occupation: f.occupation.trim(),
    social: f.social.trim(), socialPlatform: f.socialPlatform, firstEp: f.firstEp.trim(), season: f.season || 1,
    actorName: f.actorName.trim(), actorTmdbId: f.actorTmdbId, wikiUrl: f.wikiUrl.trim(), imdbUrl: f.imdbUrl.trim(),
  };
}

function blankVersion(): CastVersion {
  return { id: genId('v'), name: '', nickname: '', desc: '', age: '', photo: null, actorName: '', actorTmdbId: null, social: '', socialPlatform: 'Instagram', wikiUrl: '', imdbUrl: '' };
}

export default function AddCastSheet() {
  const { showById, updateData, settings } = useStore();
  const { activeShowId, addCastSheet, closeAddCast } = useUI();
  const show = showById(activeShowId);
  const editing = addCastSheet.editingId ? show?.cast.find((c) => c.id === addCastSheet.editingId) : null;

  const [form, setForm] = useState<FormState>(blankForm(show?.currentSeason || 1));
  const [showOtherNames, setShowOtherNames] = useState(false);
  const [fieldMenuOpen, setFieldMenuOpen] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  // Field-name keystrokes live here, outside `form`, so typing one doesn't mark the form dirty
  // or trip auto-save. Only "Set" commits the text.
  const [labelDraft, setLabelDraft] = useState<{ id: string; text: string } | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  // Once a brand-new member is created we keep saving into that record instead of adding duplicates.
  const createdIdRef = useRef<string | null>(null);
  const [nameQuery, setNameQuery] = useState('');
  const [tmdbCast, setTmdbCast] = useState<AggregateCastMember[]>([]);
  const [crop, setCrop] = useState<{ file: File | null; target: 'main' | { versionId: string } }>({ file: null, target: 'main' });
  const [versionCardId, setVersionCardId] = useState<string | null>(null);
  const [mode, setMode] = useState<'manual' | 'autofill'>('manual');
  const [afSeason, setAfSeason] = useState(show?.currentSeason || 1);
  const [afEpisode, setAfEpisode] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const originalFormRef = useRef<FormState | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [afEpisodeCount, setAfEpisodeCount] = useState(12);
  const [afPreview, setAfPreview] = useState<{ name: string; character: string; photo: string | null; id: number }[]>([]);
  const [afLoading, setAfLoading] = useState(false);

  // Mirror what the show page and detail sheet render, so the edit form doesn't show a different
  // face than the card you tapped. An upload still wins the moment it's made — displayPhoto
  // prefers data: URIs — so the tile updates immediately when you crop a new one.
  const previewPhoto = displayPhoto({ photo: form.photo, characterPhoto: editing?.characterPhoto });

  const isDrama = show?.type === 'DRAMA';
  const term = isDrama ? 'CHARACTER' : 'CONTESTANT';
  const termLower = isDrama ? 'character' : 'contestant';

  useEffect(() => {
    if (!addCastSheet.open) return;
    setMode('manual');
    setShowOtherNames(false);
    setNameQuery('');
    setIsSaving(false);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

    if (editing) {
      const initial: FormState = {
        name: editing.name, otherNames: editing.otherNames || [], nickname: editing.nickname, desc: editing.desc,
        photo: editing.photo, gender: editing.gender || '', age: editing.age, hometown: editing.hometown,
        occupation: editing.occupation, notes: editing.notes || '', firstEp: editing.firstEp, season: editing.season || 1,
        actorName: editing.actorName || '', actorTmdbId: editing.actorTmdbId, social: editing.social,
        socialPlatform: editing.socialPlatform || 'Instagram', wikiUrl: editing.wikiUrl, imdbUrl: editing.imdbUrl,
        versions: (editing.versions || []).map((v) => ({ ...v })), relationships: (editing.relationships || []).map((r) => ({ ...r })),
        customFields: (editing.customFields || []).map((cf) => ({ ...cf })),
        activeFields: [],
      };
      // Use the selection the user last confirmed, so fields they switched on stay put even when left blank.
      // Members saved before that was tracked fall back to "reveal anything holding data".
      const keys = OPTIONAL_FIELDS.map(({ key }) => key);
      initial.activeFields = editing.shownFields
        ? keys.filter((k) => editing.shownFields!.includes(k))
        : keys.filter((k) => { const v = initial[k]; return Array.isArray(v) ? v.length > 0 : !!v; });
      setForm(initial);
      originalFormRef.current = structuredClone(initial);
      setSavedSnapshot(JSON.stringify(toSavedFields(initial)));
      setShowOtherNames((editing.otherNames || []).length > 0);
    } else {
      const blank = blankForm(show?.currentSeason || 1);
      setForm(blank);
      originalFormRef.current = structuredClone(blank);
      setSavedSnapshot(JSON.stringify(toSavedFields(blank)));
    }
    setFieldMenuOpen(false);
    setEditingLabelId(null);
    setLabelDraft(null);
    createdIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addCastSheet.open, addCastSheet.editingId]);

  useEffect(() => {
    if (!addCastSheet.open || !show?.tmdbId || !hasTmdbKey()) { setTmdbCast([]); return; }
    getAggregateCredits(show.tmdbId).then(setTmdbCast).catch(() => setTmdbCast([]));
  }, [addCastSheet.open, show?.tmdbId]);

  useEffect(() => {
    if (mode !== 'autofill' || !show?.tmdbId || !hasTmdbKey()) return;
    getSeasonEpisodeCount(show.tmdbId, afSeason).then((c) => c && setAfEpisodeCount(c));
  }, [mode, show?.tmdbId, afSeason]);

  useEffect(() => {
    if (mode !== 'autofill' || !show?.tmdbId || !hasTmdbKey()) return;
    setAfLoading(true);
    getEpisodeCredits(show.tmdbId, afSeason, afEpisode).then((list) => { setAfPreview(list); setAfLoading(false); }).catch(() => setAfLoading(false));
  }, [mode, show?.tmdbId, afSeason, afEpisode]);

  const firstEpOptions = useMemo(() => Array.from({ length: 24 }, (_, i) => `Ep ${i + 1}`), []);

  const nameSuggestions = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (q.length < 2 || tmdbCast.length === 0) return [];
    return tmdbCast.filter((p) => (isDrama ? p.character.toLowerCase().includes(q) : p.name.toLowerCase().includes(q))).slice(0, 5);
  }, [nameQuery, tmdbCast, isDrama]);

  // Compare what *would* be written, not raw form state — otherwise trailing spaces or an empty
  // custom-field row leave the ✓ lit up forever after a save.
  const hasChanges = useMemo(() => JSON.stringify(toSavedFields(form)) !== savedSnapshot, [form, savedSnapshot]);

  // Auto-save effect
  useEffect(() => {
    if (!settings.autoSave || !hasChanges || !addCastSheet.open) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 2000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [form, settings.autoSave, hasChanges, addCastSheet.open]);

  const handleSave = async () => {
    if (!form.name.trim() || !show) return;
    setIsSaving(true);
    try {
      const fields = toSavedFields(form);
      const targetId = editing?.id || createdIdRef.current;
      const newId = targetId ? null : genId('c');
      updateData((d) => {
        const s = d.shows.find((x) => x.id === show.id);
        if (!s) return;
        if (targetId) {
          const c = s.cast.find((x) => x.id === targetId);
          if (c) Object.assign(c, fields);
        } else {
          s.cast.push({ ...fields, id: newId!, color: colorForIndex(s.cast.length) } as any);
        }
      });
      if (newId) createdIdRef.current = newId;
      originalFormRef.current = structuredClone(form);
      // Stay on the sheet — the ✓ greys out on its own now that the form matches what's stored.
      setSavedSnapshot(JSON.stringify(fields));
    } finally {
      setIsSaving(false);
    }
  };

  const handleUndo = () => {
    if (originalFormRef.current) {
      setForm(structuredClone(originalFormRef.current));
    }
  };

  const handleCancel = () => {
    if (hasChanges && !settings.autoSave) {
      if (confirm(`Discard changes to ${form.name || termLower}?`)) {
        handleUndo();
        closeAddCast();
      }
    } else {
      closeAddCast();
    }
  };

  if (!addCastSheet.open || !show) return null;

  const pickName = (p: AggregateCastMember) => {
    setForm((f) => ({
      ...f,
      name: isDrama ? p.character : p.name,
      photo: f.photo || p.photo,
      actorName: isDrama ? p.name : f.actorName,
      actorTmdbId: p.id,
    }));
    setNameQuery('');
  };

  const openCropFor = (file: File | undefined, target: 'main' | { versionId: string }) => {
    if (!file) return;
    setCrop({ file, target });
  };
  const confirmCrop = (dataUrl: string) => {
    if (crop.target === 'main') {
      setForm((f) => ({ ...f, photo: dataUrl }));
    } else {
      const versionId = crop.target.versionId;
      setForm((f) => ({ ...f, versions: f.versions.map((v) => (v.id === versionId ? { ...v, photo: dataUrl } : v)) }));
    }
    setCrop({ file: null, target: 'main' });
  };

  const activeFields = form.activeFields;
  const hasField = (k: OptionalField) => activeFields.includes(k);

  // Turning a field off clears its value too, so what you see in the form is what gets saved.
  const toggleField = (k: OptionalField) => {
    if (hasField(k)) {
      setForm((f) => ({ ...f, activeFields: f.activeFields.filter((x) => x !== k) }));
      setForm((f) => {
        switch (k) {
          case 'versions': return { ...f, versions: [] };
          case 'relationships': return { ...f, relationships: [] };
          case 'gender': return { ...f, gender: '' as Gender };
          case 'age': return { ...f, age: '' };
          case 'hometown': return { ...f, hometown: '' };
          case 'occupation': return { ...f, occupation: '' };
          case 'firstEp': return { ...f, firstEp: '' };
          case 'customFields': return { ...f, customFields: [] };
        }
      });
    } else {
      setForm((f) => ({ ...f, activeFields: [...f.activeFields, k] }));
      if (k === 'relationships') setForm((f) => (f.relationships.length ? f : { ...f, relationships: [{ id: genId('r'), targetId: '', label: '' }] }));
      if (k === 'customFields') setForm((f) => (f.customFields.length ? f : { ...f, customFields: [{ id: genId('cf'), label: '', value: '' }] }));
    }
  };

  const addCustomField = () => setForm((f) => ({ ...f, customFields: [...f.customFields, { id: genId('cf'), label: '', value: '' }] }));
  const removeCustomField = (id: string) => setForm((f) => ({ ...f, customFields: f.customFields.filter((cf) => cf.id !== id) }));
  const setCustomField = (id: string, key: 'label' | 'value', val: string) => setForm((f) => ({ ...f, customFields: f.customFields.map((cf) => (cf.id === id ? { ...cf, [key]: val } : cf)) }));

  // "Related to" is only offerable once there is somebody else in the show to relate to.
  const canRelate = (show?.cast.length || 0) > (editing ? 1 : 0);
  const availableFields = OPTIONAL_FIELDS.filter(({ key }) => key !== 'relationships' || canRelate);
  const trioCount = (['gender', 'age', 'hometown'] as const).filter((k) => activeFields.includes(k)).length;

  const addRelationship = () => setForm((f) => ({ ...f, relationships: [...f.relationships, { id: genId('r'), targetId: '', label: '' }] }));
  const removeRelationship = (id: string) => setForm((f) => ({ ...f, relationships: f.relationships.filter((r) => r.id !== id) }));
  const setRelField = (id: string, key: 'targetId' | 'label', val: string) => setForm((f) => ({ ...f, relationships: f.relationships.map((r) => (r.id === id ? { ...r, [key]: val } : r)) }));

  const addVersion = () => {
    const v = blankVersion();
    setForm((f) => ({ ...f, versions: [...f.versions, v] }));
    setVersionCardId(v.id);
  };
  const updateVersion = (id: string, patch: Partial<CastVersion>) => setForm((f) => ({ ...f, versions: f.versions.map((v) => (v.id === id ? { ...v, ...patch } : v)) }));
  const removeVersion = (id: string) => { setForm((f) => ({ ...f, versions: f.versions.filter((v) => v.id !== id) })); setVersionCardId(null); };

  const save = () => {
    if (!form.name.trim()) return;
    const fields = {
      name: form.name.trim(), native: '', nickname: form.nickname.trim(), otherNames: form.otherNames.map((s) => s.trim()).filter(Boolean),
      desc: form.desc.trim(), photo: form.photo, notes: form.notes.trim(), versions: form.versions,
      relationships: form.relationships.filter((r) => r.targetId && r.label.trim()).map((r) => ({ ...r, label: r.label.trim() })),
      customFields: form.customFields.map((cf) => ({ ...cf, label: cf.label.trim(), value: cf.value.trim() })).filter((cf) => cf.label || cf.value),
      shownFields: [...form.activeFields],
      gender: form.gender, age: form.age.trim(), hometown: form.hometown.trim(), occupation: form.occupation.trim(),
      social: form.social.trim(), socialPlatform: form.socialPlatform, firstEp: form.firstEp.trim(), season: form.season || 1,
      actorName: form.actorName.trim(), actorTmdbId: form.actorTmdbId, wikiUrl: form.wikiUrl.trim(), imdbUrl: form.imdbUrl.trim(),
    };
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      if (!s) return;
      if (editing) {
        const c = s.cast.find((x) => x.id === editing.id);
        if (c) Object.assign(c, fields);
      } else {
        const color = ['#5B4FD6', '#3F5FA8', '#8B4FA0', '#4F8B7A', '#A0574F', '#4F6BA0', '#7A4FA0'][s.cast.length % 7];
        s.cast.push({ id: genId('p'), color, ...fields });
      }
    });
    closeAddCast();
  };

  const deleteCast = () => {
    if (!editing) return;
    if (!window.confirm(`Delete this ${termLower}?`)) return;
    updateData((d) => { const s = d.shows.find((x) => x.id === show.id); if (s) s.cast = s.cast.filter((c) => c.id !== editing.id); });
    closeAddCast();
  };

  const addAllAutofill = () => {
    updateData((d) => {
      const s = d.shows.find((x) => x.id === show.id);
      if (!s) return;
      afPreview.forEach((p) => {
        const name = isDrama && p.character ? p.character : p.name;
        if (!name || s.cast.some((c) => c.name === name)) return;
        const color = ['#5B4FD6', '#3F5FA8', '#8B4FA0', '#4F8B7A', '#A0574F', '#4F6BA0', '#7A4FA0'][s.cast.length % 7];
        s.cast.push({
          id: genId('p'), color, name, native: '', nickname: '', otherNames: [], desc: '', photo: p.photo || null,
          notes: '', gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: 'Instagram',
          firstEp: `Ep ${afEpisode}`, season: afSeason, actorName: isDrama ? p.name : '', actorTmdbId: p.id || null,
          wikiUrl: '', imdbUrl: '', versions: [], relationships: [],
        });
      });
    });
    closeAddCast();
  };

  const editingVersion = versionCardId ? form.versions.find((v) => v.id === versionCardId) : null;

  return (
    <div className="ct-scrim" onClick={closeAddCast}>
      <div className="ct-sheet" style={{ paddingBottom: settings.autoSave ? undefined : '140px' }} onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <button className="ct-sheet-close" onClick={closeAddCast}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="var(--text)" strokeWidth="1.6" strokeLinecap="round" /></svg>
        </button>
        <div className="ct-sheet-title">{editing ? `${term.charAt(0)}${term.slice(1).toLowerCase()} Details` : `Add ${term.charAt(0)}${term.slice(1).toLowerCase()}`}</div>

        {!editing && show.tmdbId && hasTmdbKey() && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button onClick={() => setMode('manual')} className={`ct-tab-btn${mode === 'manual' ? ' is-active' : ''}`}>Manual entry</button>
            <button onClick={() => setMode('autofill')} className={`ct-tab-btn${mode === 'autofill' ? ' is-active' : ''}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="currentColor" /></svg>
              Add from episode
            </button>
          </div>
        )}

        {mode === 'autofill' ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 20 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 14 }}>Pick the season and episode you're on — we'll pull in the cast automatically.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label className="ct-label">SEASON</label>
                <select value={afSeason} onChange={(e) => { setAfSeason(parseInt(e.target.value)); setAfEpisode(1); }} className="ct-input" style={{ height: 46 }}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Season {n}</option>)}
                </select>
              </div>
              <div><label className="ct-label">EPISODE</label>
                <select value={afEpisode} onChange={(e) => setAfEpisode(parseInt(e.target.value))} className="ct-input" style={{ height: 46 }}>
                  {Array.from({ length: afEpisodeCount }, (_, i) => i + 1).map((n) => <option key={n} value={n}>Episode {n}</option>)}
                </select>
              </div>
            </div>
            {afLoading ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Loading cast&hellip;</div>
            ) : afPreview.length > 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{afPreview.length} people found: {afPreview.slice(0, 6).map((p) => isDrama ? p.character || p.name : p.name).join(', ')}{afPreview.length > 6 ? '…' : ''}</div>
            ) : null}
            <button onClick={addAllAutofill} disabled={afPreview.length === 0} className="ct-btn-primary" style={{ width: '100%' }}>Add {afPreview.length || ''} people</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: hasField('versions') ? 6 : 16, overflowX: 'auto', paddingBottom: 2 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 'none' }}>
                <div style={{ position: 'relative', width: 66, height: 66, borderRadius: 16, flex: 'none', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...bgStyle(previewPhoto, '100% auto', 'center') }}>
                  {!previewPhoto && <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-muted)' }}>{initials(form.name)}</span>}
                  <label style={{ position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 999, background: 'var(--accent)', border: '2px solid var(--sheet)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                    <input type="file" accept="image/*" onChange={(e) => openCropFor(e.target.files?.[0], 'main')} style={{ display: 'none' }} />
                  </label>
                </div>
                {hasField('versions') && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Present</span>}
              </div>

              {hasField('versions') && form.versions.map((v) => (
                <div key={v.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 'none' }}>
                  <div onClick={() => setVersionCardId(v.id)} style={{ position: 'relative', width: 66, height: 66, flex: 'none', cursor: 'pointer' }}>
                    <button onClick={(e) => { e.stopPropagation(); removeVersion(v.id); }} style={{ position: 'absolute', top: -6, right: -6, zIndex: 1, width: 20, height: 20, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 11, lineHeight: 1, cursor: 'pointer' }}>&times;</button>
                    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 16, backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...bgStyle(v.photo, 'contain') }}>
                      {!v.photo && <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-muted)' }}>{initials(v.name)}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.03em', maxWidth: 66, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.age || 'Version'}</span>
                </div>
              ))}

              {hasField('versions') && <button onClick={addVersion} style={{ width: 66, height: 66, flex: 'none', border: '1px dashed var(--input-border)', borderRadius: 16, background: 'transparent', color: 'var(--text-secondary)', fontSize: 24, fontWeight: 400, lineHeight: 1, cursor: 'pointer' }} title="Add a younger/older version">+</button>}
            </div>
            {hasField('versions') && <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4, marginBottom: 16 }}>Tap + to add another version of this {termLower} — like a younger flashback — with its own photo and age. Tap a photo to edit it.</div>}

            <label className="ct-label">{term} NAME *</label>
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input value={form.name} onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setNameQuery(e.target.value); }} placeholder="English name" className="ct-input" />
              {nameSuggestions.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, top: 50, zIndex: 5, background: 'var(--sheet)', border: '1px solid var(--border)', borderRadius: 12, padding: 6, boxShadow: '0 8px 20px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {nameSuggestions.map((p) => (
                    <button key={p.id} onClick={() => pickName(p)} style={{ display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left', border: 'none', background: 'transparent', padding: 6, borderRadius: 9, cursor: 'pointer', color: 'var(--text)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 999, flex: 'none', background: 'var(--border)', ...bgStyle(p.photo) }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isDrama ? (p.character || p.name) : p.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isDrama ? `Played by ${p.name}` : ''}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {showOtherNames ? (
              <>
                <label className="ct-label">ALSO KNOWN AS</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                  {form.otherNames.map((on, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input value={on} onChange={(e) => setForm((f) => ({ ...f, otherNames: f.otherNames.map((x, xi) => (xi === i ? e.target.value : x)) }))} placeholder="Alias, title, or romanization" className="ct-input" style={{ flex: 1 }} />
                      <button onClick={() => setForm((f) => ({ ...f, otherNames: f.otherNames.filter((_, xi) => xi !== i) }))} aria-label="Remove name" style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 6, cursor: 'pointer' }}>&times;</button>
                    </div>
                  ))}
                </div>
                <button onClick={() => setForm((f) => ({ ...f, otherNames: [...f.otherNames, ''] }))} style={{ display: 'block', border: 'none', background: 'none', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 16, cursor: 'pointer' }}>+ Add another name</button>
              </>
            ) : (
              <button onClick={() => { setShowOtherNames(true); setForm((f) => ({ ...f, otherNames: f.otherNames.length ? f.otherNames : [''] })); }} style={{ display: 'block', border: 'none', background: 'none', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 16, cursor: 'pointer' }}>+ Add other names they go by</button>
            )}

            <label className="ct-label">YOUR NICKNAME FOR THE {term}</label>
            <input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="What do you call them?" className="ct-input" style={{ marginBottom: 16 }} />

            <label className="ct-label">{term} VISUAL DESCRIPTION</label>
            <textarea value={form.desc} onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))} placeholder="Chunky glasses, pink hat, high cheekbones&hellip;" className="ct-textarea" style={{ marginBottom: 16 }} />

            <label className="ct-label">NOTES</label>
            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Your own notes about this character&hellip;" rows={3} className="ct-textarea" style={{ marginBottom: 16 }} />

            <div style={{ position: 'relative', marginBottom: 16 }}>
              <button onClick={() => setFieldMenuOpen((o) => !o)} style={{ width: '100%', height: 44, border: '1px dashed var(--input-border)', borderRadius: 12, background: 'transparent', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                + Add more details<span style={{ fontSize: 9, opacity: 0.75 }}>{fieldMenuOpen ? '▲' : '▼'}</span>
              </button>
              {fieldMenuOpen && (
                <>
                  <div onClick={() => setFieldMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 31, border: '1px solid var(--input-border)', borderRadius: 12, background: 'var(--surface)', boxShadow: '0 12px 28px rgba(0,0,0,0.22)', padding: 5 }}>
                    {availableFields.map(({ key, label }) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                        <input type="checkbox" checked={hasField(key)} onChange={() => toggleField(key)} style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                        {label}
                      </label>
                    ))}
                    <button onClick={() => setFieldMenuOpen(false)} style={{ width: '100%', height: 38, marginTop: 4, border: 'none', borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
                  </div>
                </>
              )}
            </div>

            {hasField('relationships') && (
              <>
                <label className="ct-label">RELATED TO</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
                  {form.relationships.map((rel) => (
                    <div key={rel.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <select value={rel.targetId} onChange={(e) => setRelField(rel.id, 'targetId', e.target.value)} style={{ flex: 1.2, height: 46, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', color: 'var(--text)', padding: '0 10px', fontSize: 13.5 }}>
                        <option value="">Choose {termLower}&hellip;</option>
                        {show.cast.filter((c) => c.id !== editing?.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input value={rel.label} onChange={(e) => setRelField(rel.id, 'label', e.target.value)} placeholder="e.g. Love interest, older brother" className="ct-input" style={{ flex: 1 }} />
                      <button onClick={() => removeRelationship(rel.id)} aria-label="Remove relationship" style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 6, cursor: 'pointer' }}>&times;</button>
                    </div>
                  ))}
                </div>
                <button onClick={addRelationship} style={{ display: 'block', border: 'none', background: 'none', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 16, cursor: 'pointer' }}>+ Add relationship</button>
              </>
            )}

            {trioCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${trioCount}, 1fr)`, gap: 10, marginBottom: 12 }}>
                {hasField('gender') && (
                  <div><label className="ct-label">GENDER</label>
                    <select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Gender }))} className="ct-input" style={{ padding: '0 10px', fontSize: 14 }}>
                      <option value="">Not set</option><option value="Female">Female</option><option value="Male">Male</option><option value="Non-binary">Non-binary</option>
                    </select>
                  </div>
                )}
                {hasField('age') && <div><label className="ct-label">AGE</label><input value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value }))} className="ct-input" /></div>}
                {hasField('hometown') && <div><label className="ct-label">HOMETOWN</label><input value={form.hometown} onChange={(e) => setForm((f) => ({ ...f, hometown: e.target.value }))} className="ct-input" /></div>}
              </div>
            )}
            {hasField('occupation') && (
              <div style={{ marginBottom: 12 }}><label className="ct-label">OCCUPATION</label><input value={form.occupation} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} className="ct-input" /></div>
            )}
            {hasField('firstEp') && (
              <div style={{ marginBottom: 12 }}>
                <label className="ct-label">FIRST SEEN</label>
                <select value={form.firstEp} onChange={(e) => setForm((f) => ({ ...f, firstEp: e.target.value }))} className="ct-input">
                  <option value="">Not sure yet</option>
                  {firstEpOptions.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
                </select>
              </div>
            )}
            {hasField('customFields') && (
              <div style={{ marginBottom: 12 }}>
                {form.customFields.map((cf) => {
                  // A title stays editable until it has been confirmed once; the pencil brings it back.
                  const titleEditing = editingLabelId === cf.id || !cf.label.trim();
                  const draft = labelDraft?.id === cf.id ? labelDraft.text : cf.label;
                  const commitLabel = () => {
                    if (!draft.trim()) return;
                    setCustomField(cf.id, 'label', draft.trim());
                    setEditingLabelId(null);
                    setLabelDraft(null);
                  };
                  return (
                    <div key={cf.id} style={{ marginBottom: 10 }}>
                      {titleEditing ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                          <input
                            value={draft}
                            onChange={(e) => setLabelDraft({ id: cf.id, text: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitLabel(); } }}
                            placeholder="Field name — e.g. Allies, Enemies"
                            className="ct-input"
                            style={{ flex: 1, fontWeight: 700 }}
                          />
                          <button onClick={commitLabel} disabled={!draft.trim()} aria-label="Confirm field name" style={{ flex: 'none', height: 46, padding: '0 14px', border: 'none', borderRadius: 11, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 13, fontWeight: 700, cursor: draft.trim() ? 'pointer' : 'not-allowed', opacity: draft.trim() ? 1 : 0.5 }}>Set</button>
                          <button onClick={() => { removeCustomField(cf.id); setEditingLabelId(null); setLabelDraft(null); }} aria-label="Remove field" style={{ border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 6, cursor: 'pointer' }}>&times;</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          <span className="ct-label" style={{ marginBottom: 0, textTransform: 'uppercase' }}>{cf.label}</span>
                          <button onClick={() => { setEditingLabelId(cf.id); setLabelDraft({ id: cf.id, text: cf.label }); }} aria-label="Rename field" style={{ border: 'none', background: 'none', padding: 2, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="#C9924A" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                          </button>
                          <button onClick={() => removeCustomField(cf.id)} aria-label="Remove field" style={{ marginLeft: 'auto', border: 'none', background: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, padding: 6, cursor: 'pointer' }}>&times;</button>
                        </div>
                      )}
                      <textarea value={cf.value} onChange={(e) => setCustomField(cf.id, 'value', e.target.value)} placeholder="What goes in this field?" rows={2} className="ct-textarea" />
                    </div>
                  );
                })}
                <button onClick={addCustomField} style={{ display: 'block', border: 'none', background: 'none', color: 'var(--accent-soft)', fontSize: 13, fontWeight: 700, padding: 0, marginBottom: 4, cursor: 'pointer' }}>+ Add another field</button>
              </div>
            )}

            <div style={{ padding: '16px 14px', borderRadius: 14, background: 'color-mix(in oklch, var(--accent-soft) 8%, transparent)', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 4, height: 14, borderRadius: 2, background: 'var(--accent-soft)' }} /><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent-soft)' }}>{isDrama ? 'ABOUT THE ACTOR' : 'MORE'}</div></div>
              {isDrama && <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -6 }}>Real-world info — separate from the character</div>}
              {isDrama && (
                <div><label className="ct-label">ACTOR NAME</label><input value={form.actorName} onChange={(e) => setForm((f) => ({ ...f, actorName: e.target.value }))} placeholder="Real actor's name" className="ct-input" /></div>
              )}
              <div>
                <label className="ct-label">SOCIAL</label>
                <div style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 8 }}>
                  <select value={form.socialPlatform} onChange={(e) => setForm((f) => ({ ...f, socialPlatform: e.target.value }))} style={{ width: '100%', height: 46, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', padding: '0 8px', fontSize: 13, color: 'var(--text)' }}>
                    {SOCIAL_PLATFORMS.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
                  </select>
                  <input value={form.social} onChange={(e) => setForm((f) => ({ ...f, social: e.target.value }))} placeholder="@handle" className="ct-input" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div><label className="ct-label">WIKIPEDIA LINK</label><input value={form.wikiUrl} onChange={(e) => setForm((f) => ({ ...f, wikiUrl: e.target.value }))} className="ct-input" /></div>
                <div><label className="ct-label">IMDB LINK</label><input value={form.imdbUrl} onChange={(e) => setForm((f) => ({ ...f, imdbUrl: e.target.value }))} className="ct-input" /></div>
              </div>
            </div>

            <EditControls
              onSave={handleSave}
              onCancel={handleCancel}
              onUndo={handleUndo}
              autoSave={settings.autoSave}
              isSaving={isSaving}
              hasChanges={hasChanges}
              hidden={fieldMenuOpen}
            />
            {editing && <button onClick={deleteCast} style={{ width: '100%', height: 40, border: 'none', background: 'transparent', color: '#E08A80', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 12 }}>Delete {termLower}</button>}
          </>
        )}
      </div>

      {editingVersion && (
        <VersionCardPanel
          version={editingVersion}
          onChange={(patch) => updateVersion(editingVersion.id, patch)}
          onUpload={(file) => openCropFor(file, { versionId: editingVersion.id })}
          onRemove={() => removeVersion(editingVersion.id)}
          onClose={() => setVersionCardId(null)}
        />
      )}

      <CropModal file={crop.file} onCancel={() => setCrop({ file: null, target: 'main' })} onConfirm={confirmCrop} />
    </div>
  );
}

function VersionCardPanel({ version, onChange, onUpload, onRemove, onClose }: {
  version: CastVersion;
  onChange: (patch: Partial<CastVersion>) => void;
  onUpload: (file: File | undefined) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="ct-scrim" style={{ zIndex: 45 }} onClick={onClose}>
      <div className="ct-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="ct-sheet-grabber" />
        <div className="ct-sheet-title" style={{ marginBottom: 4 }}>Character version</div>
        <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 18 }}>Edit freely for this version — a younger/older look with its own photo.</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ position: 'relative', width: 66, height: 66, borderRadius: 16, flex: 'none', backgroundColor: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', ...bgStyle(version.photo, 'contain') }}>
            {!version.photo && <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-muted)' }}>{initials(version.name)}</span>}
            <label style={{ position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 999, background: 'var(--accent)', border: '2px solid var(--sheet)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11 2.5l2.5 2.5-8 8L3 13.5l.5-2.5 8-8z" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" /></svg>
              <input type="file" accept="image/*" onChange={(e) => onUpload(e.target.files?.[0])} style={{ display: 'none' }} />
            </label>
          </div>
          <div><label className="ct-label">AGE / RANGE</label><input value={version.age} onChange={(e) => onChange({ age: e.target.value })} placeholder="8, Teen, Young adult..." style={{ width: 140, height: 40, border: '1px solid var(--input-border)', borderRadius: 10, background: 'var(--surface)', padding: '0 12px', fontSize: 14, color: 'var(--text)', outline: 'none' }} /></div>
        </div>

        <label className="ct-label">ACTOR NAME</label>
        <input value={version.actorName} onChange={(e) => onChange({ actorName: e.target.value })} placeholder="Who played this version" className="ct-input" style={{ marginBottom: 12 }} />
        <label className="ct-label">NAME</label>
        <input value={version.name} onChange={(e) => onChange({ name: e.target.value })} className="ct-input" style={{ marginBottom: 12 }} />
        <label className="ct-label">NICKNAME</label>
        <input value={version.nickname} onChange={(e) => onChange({ nickname: e.target.value })} className="ct-input" style={{ marginBottom: 12 }} />
        <label className="ct-label">VISUAL DESCRIPTION</label>
        <textarea value={version.desc} onChange={(e) => onChange({ desc: e.target.value })} placeholder="Chunky glasses, pink hat, high cheekbones&hellip;" className="ct-textarea" style={{ marginBottom: 20 }} />

        <div style={{ padding: '16px 14px', borderRadius: 14, background: 'color-mix(in oklch, var(--accent-soft) 8%, transparent)', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}><div style={{ width: 4, height: 14, borderRadius: 2, background: 'var(--accent-soft)' }} /><div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--accent-soft)' }}>ABOUT THE ACTOR</div></div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', margin: '0 0 12px' }}>Real-world info — separate from the character</div>
          <div style={{ marginBottom: 12 }}>
            <label className="ct-label">SOCIAL</label>
            <div style={{ display: 'grid', gridTemplateColumns: '108px 1fr', gap: 8 }}>
              <select value={version.socialPlatform} onChange={(e) => onChange({ socialPlatform: e.target.value })} style={{ width: '100%', height: 46, border: '1px solid var(--input-border)', borderRadius: 11, background: 'var(--surface)', padding: '0 8px', fontSize: 13, color: 'var(--text)' }}>
                {SOCIAL_PLATFORMS.map((sp) => <option key={sp} value={sp}>{sp}</option>)}
              </select>
              <input value={version.social} onChange={(e) => onChange({ social: e.target.value })} placeholder="@handle" className="ct-input" />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="ct-label">WIKIPEDIA LINK</label><input value={version.wikiUrl} onChange={(e) => onChange({ wikiUrl: e.target.value })} className="ct-input" /></div>
            <div><label className="ct-label">IMDB LINK</label><input value={version.imdbUrl} onChange={(e) => onChange({ imdbUrl: e.target.value })} className="ct-input" /></div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 9 }}>
          <button onClick={onRemove} className="ct-btn-ghost" style={{ flex: 1, color: '#E08A80', borderColor: 'var(--input-border)' }}>Remove version</button>
          <button onClick={onClose} className="ct-btn-primary" style={{ flex: 1 }}>Done</button>
        </div>
      </div>
    </div>
  );
}
