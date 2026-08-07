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
