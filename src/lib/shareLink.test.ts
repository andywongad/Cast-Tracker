/**
 * Share-link round trips. Run with `npm test`.
 *
 * The case that matters is the one asserting what must NOT travel: auto-loaded cast, which would
 * multiply a link's size by ten and arrives from TMDb on the other side anyway. After that it is
 * all round-tripping — a link that loses a field loses someone's writing silently, which is the
 * failure mode worth guarding.
 */
import { packShow, packCast, unpackShow, unpackCast, encodeShare, decodeShare, MAX_LINK_CHARS } from './shareLink';
import type { CastMember, Show } from '../types';

const member = (id: string, over: Partial<CastMember> = {}): CastMember =>
  ({ id, name: id, nickname: '', native: '', otherNames: [], desc: '', photo: null, notes: '',
     gender: '', age: '', hometown: '', occupation: '', social: '', socialPlatform: 'Instagram',
     firstEp: 'Ep 1', season: 1, actorName: '', actorTmdbId: null, wikiUrl: '', imdbUrl: '',
     versions: [], relationships: [], color: '', ...over } as CastMember);

const show = (cast: CastMember[], over: Partial<Show> = {}): Show =>
  ({ id: 's1', title: 'The Bear', type: 'DRAMA', color: '', status: 'watching', cast,
     poster: 'https://image.tmdb.org/t/p/w300/x.jpg', tmdbId: 136315, originCountry: 'US',
     wikiUrl: '', imdbUrl: '', ...over } as Show);

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
};

const color = () => '#2E4356';

async function main() {
  console.log('packShow — what travels');
  {
    const s = show([
      member('a', { notes: 'mine', actorTmdbId: 206905 }),
      member('b', { auto: true } as Partial<CastMember>),
      member('c', { auto: true, nickname: 'edited' } as Partial<CastMember>),
    ]);
    const packed = packShow(s);
    check('auto-loaded cast is left behind', packed.c.length === 2, `got ${packed.c.length}`);
    check('an auto record the user edited still travels', packed.c.some((p) => p.nic === 'edited'));
  }
  {
    const packed = packShow(show([member('a', { photo: 'https://image.tmdb.org/t/p/w300/y.jpg', actorTmdbId: 99 })]));
    check('a TMDb photo travels as a bare path', packed.c[0].tmb === '/y.jpg' && packed.c[0].pho === undefined);
    check('the actor id travels too', packed.c[0].a === 99);
    const back = unpackShow(packed, () => '', 'x');
    check('and is rebuilt at the size the app uses', back.cast[0].photo === 'https://image.tmdb.org/t/p/w185/y.jpg');
  }
  {
    const packed = packShow(show([member('a', { photo: 'data:image/png;base64,AAAA' })]));
    check('an uploaded photo is carried, being unrecoverable', typeof packed.c[0].pho === 'string');
  }
  {
    const packed = packShow(show([member('a')]));
    check('empty fields are omitted entirely', packed.c[0].nic === undefined && packed.c[0].not === undefined);
  }

  console.log('round trip');
  {
    const original = member('a', {
      name: 'Carmy', nickname: 'Carm', whoTheyAre: 'The chef', notes: 'watch the brother thread',
      otherNames: ['Chef'], gender: 'Male', hometown: 'Chicago', actorTmdbId: 206905,
      relationships: [{ id: 'r1', targetId: 'x', label: 'Sister' }],
      firstEp: 'Ep 3', season: 2, firstEpPinned: true,
    });
    const s = show([original]);
    const back = unpackShow(packShow(s), color, 'new-id');
    const c = back.cast[0];
    check('title and tmdb id survive', back.title === 'The Bear' && back.tmdbId === 136315);
    check('every authored field survives', c.nickname === 'Carm' && c.whoTheyAre === 'The chef'
      && c.notes === 'watch the brother thread' && c.hometown === 'Chicago' && c.gender === 'Male');
    check('collections survive', c.otherNames.join() === 'Chef' && c.relationships.length === 1);
    check('episode and season survive', c.firstEp === 'Ep 3' && c.season === 2 && c.firstEpPinned === true);
    check('the record gets a fresh id', c.id !== 'a' && c.id.length > 3);
    check('the show gets the id it was given', back.id === 'new-id');
  }
  {
    const s = show([member('a', { notes: 'x' })]);
    const packed = packCast(s, s.cast[0]);
    const back = unpackCast(packed, '#fff');
    check('a character card round trips', back.notes === 'x' && packed.st === 'The Bear');
  }

  console.log('encode / decode');
  {
    const s = show([member('a', { notes: 'hello', nickname: 'H' })]);
    const { url, tooLong } = await encodeShare(packShow(s), 'https://example.com/');
    check('the payload rides in the fragment', url.includes('#s='));
    check('a small share is not flagged as too long', !tooLong);
    const decoded = await decodeShare(url.split('#s=')[1]);
    check('decode returns the packet', !!decoded && decoded.k === 'show');
    check('and it still holds the writing', JSON.stringify(decoded).includes('hello'));
  }
  {
    check('garbage decodes to null, not an exception', (await decodeShare('dNOT-VALID-BASE64!!')) === null);
    check('an empty value decodes to null', (await decodeShare('')) === null);
  }
  {
    // A truncated link is the realistic failure: messaging apps cut long URLs.
    const { url } = await encodeShare(packShow(show([member('a', { notes: 'x'.repeat(400) })])), 'https://example.com/');
    const body = url.split('#s=')[1];
    check('a truncated link decodes to null', (await decodeShare(body.slice(0, body.length - 12))) === null);
  }
  {
    // Deliberately incompressible: repetitive filler would deflate away and the cap would never
    // trip, which is a test of the compressor rather than of the guard.
    const noise = (n: number) => Array.from({ length: n }, () => Math.random().toString(36).slice(2)).join('');
    const many = Array.from({ length: 200 }, (_, i) =>
      member('p' + i, { name: `Character ${i}`, notes: noise(12) }));
    const { url, tooLong } = await encodeShare(packShow(show(many)), 'https://example.com/');
    check('an oversized library is flagged rather than silently truncated', tooLong, `${url.length} chars`);
    check('the cap is the one documented', MAX_LINK_CHARS === 8000);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

void main();
