export type ShowType = 'DRAMA' | 'REALITY' | 'VARIETY';
export type ShowStatus = 'watching' | 'completed';
export type Gender = '' | 'Female' | 'Male' | 'Non-binary';

export interface Relationship {
  id: string;
  targetId: string;
  label: string;
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
  /** Which optional fields the user has switched on for this member — kept even when left blank. */
  shownFields?: string[];
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
  caughtUpEp?: string;
  mapEpisode?: string;
  /**
   * Resolved TVmaze show id. `number` = matched, `null` = looked up and no match exists,
   * `undefined` = never looked up. The null/undefined distinction is what stops us retrying
   * a lookup that will never succeed.
   */
  tvmazeId?: number | null;
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
