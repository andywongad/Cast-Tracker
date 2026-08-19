/**
 * What kind of show this is, which decides characters vs contestants, the relationship map,
 * whether a season carries its cast forward, and whether TVmaze photos are looked up.
 *
 * 'VARIETY' is retained but never produced. It only ever came from TMDb's Talk and News genres —
 * TMDb has no variety genre, and Korean variety shows are tagged Reality — and it behaved
 * identically to 'REALITY' everywhere. Kept in the union so records written before it was
 * withdrawn, and share codes carrying it, stay valid and keep behaving as reality.
 */
export type ShowType = 'DRAMA' | 'REALITY' | 'VARIETY';
export type ShowStatus = 'watching' | 'completed';
export type Gender = '' | 'Female' | 'Male' | 'Non-binary';

export interface Relationship {
  id: string;
  targetId: string;
  label: string;
}

/**
 * Non-destructive framing for a photo. Stored as CSS-ready percentages and applied at render
 * time, so the source image is never modified — sliding zoom back to 1 restores the original
 * framing, and reopening the cropper resumes exactly where it left off.
 *
 * `size` is background-size as a percentage of the container width (100 = image width fills the
 * box). `x`/`y` are background-position percentages, 0–100.
 */
export interface PhotoCrop {
  size: number;
  x: number;
  y: number;
}

/** A user-defined field on a cast member — their own title plus free text, e.g. "Allies" / "Enemies". */
export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface CastVersion {
  id: string;
  name: string;
  nickname: string;
  desc: string;
  age: string; // stage label, e.g. "Teen", "8", "Young adult"
  photo: string | null;
  actorName: string;
  actorTmdbId: number | null;
  social: string;
  socialPlatform: string;
  wikiUrl: string;
  imdbUrl: string;
}

export interface MapCell {
  r: number;
  c: number;
}

export interface MapRelationship {
  id: string;
  targetId: string;
  label: string;
  kind: 'interested';
}

export interface CastMember {
  id: string;
  color: string;
  name: string;
  native: string;
  nickname: string;
  otherNames: string[];
  /**
   * The user's one-line answer to "who is this?" — "Meadow's boyfriend", "the family lawyer".
   * Distinct from `desc`, which is what they look like, and from the generated bio, which is
   * whatever a source said. Optional: absent on every record written before it existed.
   */
  whoTheyAre?: string;
  desc: string;
  photo: string | null;
  notes: string;
  gender: Gender;
  age: string;
  hometown: string;
  occupation: string;
  social: string;
  socialPlatform: string;
  firstEp: string;
  season: number;
  actorName: string;
  actorTmdbId: number | null;
  wikiUrl: string;
  imdbUrl: string;
  versions: CastVersion[];
  relationships: Relationship[];
  customFields?: CustomField[];
  /**
   * In-character still from TVmaze, preferred over `photo` (a TMDb actor headshot) when present.
   * TVmaze image URLs are immutable — a changed primary image gets a new URL — so this is safe
   * to persist indefinitely.
   */
  characterPhoto?: string | null;
  /** Framing applied to whichever photo is displayed. Absent = default centred framing. */
  photoCrop?: PhotoCrop | null;
  /** Which optional fields the user has switched on for this member — kept even when left blank. */
  shownFields?: string[];
  /**
   * The user set `firstEp` deliberately, rather than it being stamped by an episode import.
   *
   * Both bits of information are needed and neither can be inferred from the other. `firstEp`
   * alone can't distinguish "you told me they arrive in episode 7" from "episode 7 is where I
   * happened to pick them up", and every auto-loaded record carries a value — so treating any
   * non-empty `firstEp` as a user's choice would make the whole library undeletable, and treating
   * none of them as one lets an import silently overwrite what the user said.
   */
  firstEpPinned?: true;
  /**
   * Pulled in by selecting an episode rather than chosen by the user.
   *
   * Provenance only — it never becomes false. Whether a record is disposable is decided by
   * `isDisposable` in lib/castValue.ts, which asks whether anything of the user's is in it. That
   * way editing a record promotes it with no write to this field and no call site to remember.
   *
   * Absent on every record written before this existed, which reads as "the user's", the safe
   * default for anything already on someone's device.
   */
  auto?: true;
  // relationship-map state, keyed by "season_episodeLabel"
  /**
   * When this record was last edited, epoch ms. Stamped centrally in `updateData` by diffing the
   * record against its previous value — never by the code doing the editing, for the same reason
   * `hasUserContent` is derived rather than flagged: a field that has to be set by hand at every
   * edit site is a field that will be forgotten at one of them, and here the forgotten one would
   * mean an edit that never syncs.
   *
   * Absent on everything written before sync existed, which reads as 0 — older than any remote
   * record, so a first sync treats the device's untouched history as the loser in a conflict and
   * nothing is silently overwritten in the other direction.
   */
  editedAt?: number;
  // relationship-map state, keyed by "season_episodeLabel"
  relByEp?: Record<string, MapRelationship[]>;
  mapCellByEp?: Record<string, MapCell | null>;
  hideFromMap?: boolean;
}

export interface Show {
  id: string;
  title: string;
  type: ShowType;
  color: string;
  status: ShowStatus;
  cast: CastMember[];
  poster: string | null;
  tmdbId: number | null;
  originCountry: string;
  wikiUrl: string;
  imdbUrl: string;
  currentSeason?: number;
  /** Retired: the caught-up dropdown was replaced by the episode strip. Kept so existing
   * records stay valid and the ShowTile badge still renders for anyone who set one. */
  caughtUpEp?: string;
  mapEpisode?: string;
  /**
   * Resolved TVmaze show id. `number` = matched, `null` = looked up and no match exists,
   * `undefined` = never looked up. The null/undefined distinction is what stops us retrying
   * a lookup that will never succeed.
   */
  tvmazeId?: number | null;
  /** Last edit to the show's own fields, epoch ms. Cast records carry their own — see CastMember. */
  editedAt?: number;
}

export interface AppData {
  shows: Show[];
}

export interface AppSettings {
  theme: 'Light' | 'Dark' | null;
  showColumns: number;
  castColumns: number;
  autoSave: boolean;
}

export type SharePayload =
  | { kind: 'show'; title: string; type: ShowType; poster: string | null; tmdbId: number | null; originCountry: string; wikiUrl: string; imdbUrl: string; cast: CastMember[] }
  | { kind: 'cast'; showTitle: string; char: CastMember };

export interface ShareEntry {
  payload: SharePayload;
  createdAt: number;
}

export type ShareStore = Record<string, ShareEntry>;
