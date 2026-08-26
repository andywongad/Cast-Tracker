import type { CastMember, Show, ShowType } from '../types';
import { isDisposable } from './castValue';

/**
 * Shows and characters, packed small enough to travel in a URL.
 *
 * This replaces a six-character code that only ever worked on the device that generated it: the
 * payload sat in that browser's localStorage, so "Enter the code someone shared with you" was a
 * promise the app had no way to keep. A link carries its own contents, so it works for anyone.
 *
 * The size trick is to send only what cannot be re-fetched. A show is a TMDb id plus whatever the
 * user wrote; auto-loaded cast is TMDb's and regenerates on the recipient's device, so it stays
 * behind. On the demo library that takes a show from 4,296 characters of JSON to a 1,175-character
 * URL, with every authored record still aboard.
 *
 * Keys are one or three letters because every byte here is a byte of someone's link. The map below
 * is the single source of truth for that, so a field cannot be encoded under one name and read
 * under another.
 */

/** The fields only a person fills in. Anything absent from a record is absent from the link. */
const FIELDS: Record<string, keyof CastMember> = {
  nic: 'nickname',
  who: 'whoTheyAre',
  dsc: 'desc',
  not: 'notes',
  nat: 'native',
  age: 'age',
  hom: 'hometown',
  occ: 'occupation',
  soc: 'social',
  gen: 'gender',
  oth: 'otherNames',
  cus: 'customFields',
  rel: 'relationships',
  ver: 'versions',
  crp: 'photoCrop',
  shn: 'shownFields',
};

interface PackedMember {
  n: string;
  /** TMDb person id, which is what lets the recipient's app recover the photo and actor name. */
  a?: number;
  e?: string;
  s?: number;
  [key: string]: unknown;
}

export interface ShowShare {
  v: 1;
  k: 'show';
  t: string;
  y: ShowType;
  i: number | null;
  p: string | null;
  o?: string;
  w?: string;
  m?: string;
  c: PackedMember[];
}

export interface CastShare {
  v: 1;
  k: 'cast';
  /** Only for display — "Sydney, from The Bear" — so the recipient knows what they are accepting. */
  st: string;
  c: [PackedMember];
}

export type SharePacket = ShowShare | CastShare;

/**
 * Where a link stops being shareable.
 *
 * Browsers take far more than this; messaging apps and QR codes are the real ceiling, and a link
 * silently truncated by iMessage fails in a way neither person can diagnose. Refusing to make one
 * is kinder than producing one that looks fine.
 */
export const MAX_LINK_CHARS = 8000;

function packMember(c: CastMember): PackedMember {
  const out: PackedMember = { n: c.name };
  if (c.actorTmdbId) out.a = c.actorTmdbId;
  if (c.firstEp) out.e = c.firstEp;
  if (c.season) out.s = c.season;
  if (c.firstEpPinned) out.fep = 1;
  if (c.hideFromMap) out.hid = 1;
  /**
   * Photos travel, but TMDb ones travel as just their path.
   *
   * The first version dropped TMDb URLs on the theory that `a` above could recover them. It can't,
   * not without a person lookup per record — so shared characters arrived showing initials while
   * the cast auto-loaded around them had faces, which looked like the import had half worked. The
   * path costs about 32 characters and the shared prefix compresses to nothing.
   */
  if (typeof c.photo === 'string' && c.photo.startsWith('data:')) out.pho = c.photo;
  else if (typeof c.photo === 'string' && c.photo.includes('image.tmdb.org')) {
    const path = c.photo.split(/\/t\/p\/[^/]+/)[1];
    if (path) out.tmb = path;
  } else if (typeof c.photo === 'string' && c.photo) out.pho = c.photo;
  // In-character stills are immutable on TVmaze and would otherwise need a show-and-name lookup.
  if (typeof c.characterPhoto === 'string' && c.characterPhoto) out.cph = c.characterPhoto;

  for (const [key, field] of Object.entries(FIELDS)) {
    const v = c[field];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[key] = v;
  }
  return out;
}

function unpackMember(p: PackedMember, index: number): CastMember {
  const m: CastMember = {
    id: `p${Date.now().toString(36)}${index}${Math.random().toString(36).slice(2, 6)}`,
    color: '',
    name: typeof p.n === 'string' ? p.n : '',
    native: '', nickname: '', otherNames: [], desc: '', photo: null, notes: '',
    gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: 'Instagram',
    firstEp: typeof p.e === 'string' ? p.e : '',
    season: typeof p.s === 'number' ? p.s : 1,
    actorName: '',
    actorTmdbId: typeof p.a === 'number' ? p.a : null,
    wikiUrl: '', imdbUrl: '', versions: [], relationships: [],
  };
  if (typeof p.pho === 'string') m.photo = p.pho;
  // Rebuilt at w185, the size the app asks for everywhere else — see the note in lib/tmdb.ts.
  else if (typeof p.tmb === 'string') m.photo = `https://image.tmdb.org/t/p/w185${p.tmb}`;
  if (typeof p.cph === 'string') m.characterPhoto = p.cph;
  if (p.fep) m.firstEpPinned = true;
  if (p.hid) m.hideFromMap = true;

  for (const [key, field] of Object.entries(FIELDS)) {
    const v = p[key];
    if (v === undefined) continue;
    (m as unknown as Record<string, unknown>)[field] = v;
  }
  return m;
}

export function packShow(show: Show): ShowShare {
  return {
    v: 1, k: 'show',
    t: show.title, y: show.type, i: show.tmdbId, p: show.poster,
    ...(show.originCountry ? { o: show.originCountry } : {}),
    ...(show.wikiUrl ? { w: show.wikiUrl } : {}),
    ...(show.imdbUrl ? { m: show.imdbUrl } : {}),
    // The whole size argument in one line: auto-loaded cast is left behind because it comes back
    // from TMDb on the recipient's device.
    c: show.cast.filter((c) => !isDisposable(c)).map(packMember),
  };
}

export function packCast(show: Show, member: CastMember): CastShare {
  return { v: 1, k: 'cast', st: show.title, c: [packMember(member)] };
}

/** A show ready to push into the library, with fresh ids so it can sit alongside an existing copy. */
export function unpackShow(packet: ShowShare, colorFor: (i: number) => string, id: string): Show {
  return {
    id,
    title: packet.t,
    type: packet.y,
    color: colorFor(0),
    status: 'watching',
    cast: packet.c.map((p, i) => ({ ...unpackMember(p, i), color: colorFor(i) })),
    poster: packet.p ?? null,
    tmdbId: typeof packet.i === 'number' ? packet.i : null,
    originCountry: packet.o ?? '',
    wikiUrl: packet.w ?? '',
    imdbUrl: packet.m ?? '',
  };
}

export function unpackCast(packet: CastShare, color: string): CastMember {
  return { ...unpackMember(packet.c[0], 0), color };
}

/* ------------------------------------------------------------------ transport */

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function squeeze(bytes: Uint8Array): Promise<Uint8Array> {
  // Native in every current browser. The fallback is not an error path — it just produces a longer
  // link, which is the right trade against refusing to share at all.
  if (typeof CompressionStream === 'undefined') return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unsqueeze(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') return bytes;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The fragment, not the query string.
 *
 * A fragment is never sent to the server, so the notes someone wrote about their favourite
 * character do not land in a request log on the way to being shared. It is also why this cannot be
 * a server-rendered preview: nobody but the recipient's browser can read it, which is the point.
 */
export const SHARE_PARAM = 's';

export async function encodeShare(packet: SharePacket, origin: string): Promise<{ url: string; tooLong: boolean }> {
  const json = new TextEncoder().encode(JSON.stringify(packet));
  const packed = await squeeze(json);
  const encoded = typeof CompressionStream === 'undefined'
    ? `u${toBase64Url(json)}`   // `u` for uncompressed, so the reader knows not to inflate
    : `d${toBase64Url(packed)}`;
  const url = `${origin}#${SHARE_PARAM}=${encoded}`;
  return { url, tooLong: url.length > MAX_LINK_CHARS };
}

export async function decodeShare(value: string): Promise<SharePacket | null> {
  try {
    const marker = value[0];
    const body = value.slice(1);
    if (marker !== 'd' && marker !== 'u') return null;
    const bytes = fromBase64Url(body);
    const json = marker === 'd' ? await unsqueeze(bytes) : bytes;
    const packet = JSON.parse(new TextDecoder().decode(json)) as SharePacket;
    if (!packet || packet.v !== 1) return null;
    if (packet.k === 'show') return Array.isArray(packet.c) && typeof packet.t === 'string' ? packet : null;
    if (packet.k === 'cast') return Array.isArray(packet.c) && packet.c.length === 1 ? packet : null;
    return null;
  } catch {
    // A truncated or mangled link is the expected failure — messaging apps cut long URLs — and it
    // is the caller's job to say so, not this function's to throw.
    return null;
  }
}

/** Reads and clears the share fragment. Must run before anything normalises the URL. */
export function takeShareFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const value = params.get(SHARE_PARAM);
    if (!value) return null;
    window.history.replaceState({}, '', window.location.pathname + window.location.search);
    return value;
  } catch {
    return null;
  }
}
