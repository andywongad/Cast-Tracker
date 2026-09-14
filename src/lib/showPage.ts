import { CORE_EPISODE_RATIO } from './showShape.js';
import type { AggregateCastMember } from './tmdb.js';

/**
 * What a public show page says about each person in the cast.
 *
 * Pure, and in src/lib rather than beside the route, for the reason every other rule in this
 * codebase that matters is: the route cannot be reached by the test suite and this can.
 *
 * ## Why a count and a tier, and not "appears in episodes 3-8"
 *
 * Because the data does not exist. `aggregate_credits` is one request for the whole series and it
 * returns `total_episode_count` — a number — with no episode identity and, as tmdb.ts puts it, "no
 * season identity at all". Real ranges would mean per-episode credits: one request per episode,
 * which is ten for a short season and several hundred for a soap, on every page render.
 *
 * A range would also be the less spoiler-safe answer, which is the part worth stating plainly. "In
 * episodes 3-8 of 10" tells a reader that someone is gone before the finale. "In 28 of 39 episodes"
 * tells them almost nothing, and "Main cast" tells them nothing at all. This app refuses to spoil
 * a bio or a recap; a page anyone can reach from a search result is not the place to start.
 */

export type CastTier = 'main' | 'recurring' | 'guest';

export interface PageCastMember {
  name: string;
  character: string;
  photo: string | null;
  episodeCount: number;
  tier: CastTier;
  /** Ready to print: "28 of 39 episodes". Built here so the route only interpolates. */
  billing: string;
}

/**
 * A show's whole credited cast is not a cast list.
 *
 * Law & Order credits 7,551 people across 545 episodes, almost all of them for one scene. Printing
 * them would be a megabyte of names nobody reads and exactly the kind of page a search engine
 * treats as junk. Sixty is past the point where a real ensemble is covered — the Sopranos' core is
 * thirty-two — and short enough to stay a page rather than a database dump.
 */
const MAX_CAST = 60;

/**
 * Anyone in more than one episode recurs; that is what the word means, and it needs no threshold of
 * its own. The line above it is `CORE_EPISODE_RATIO`, borrowed from showShape so this page and the
 * app's own cast layout cannot drift into disagreeing about who is a lead.
 */
export function tierFor(episodeCount: number, totalEpisodes: number): CastTier {
  if (totalEpisodes > 0 && episodeCount > CORE_EPISODE_RATIO * totalEpisodes) return 'main';
  return episodeCount > 1 ? 'recurring' : 'guest';
}

const TIER_LABEL: Record<CastTier, string> = {
  main: 'Main cast',
  recurring: 'Recurring',
  guest: 'Guest',
};

/**
 * "28 of 39 episodes" — the count alone, because the tier is a heading above the row.
 *
 * It was on every row to begin with, and the first render against a real show showed why that was
 * wrong: Game of Thrones' sixty most-present actors are all above the threshold, so all sixty rows
 * read "Main cast" and the label carried no information sixty times over. Sorting by presence and
 * then labelling by presence says the same thing twice. As a heading it is worth reading once.
 */
export function billingFor(episodeCount: number, totalEpisodes: number): string {
  if (!episodeCount) return '';
  const of = totalEpisodes > 0 ? ` of ${totalEpisodes}` : '';
  return `${episodeCount}${of} episode${episodeCount === 1 && !of ? '' : 's'}`;
}

/** Tier groups in billing order, empty ones dropped. What the page prints as headings. */
export function groupByTier(cast: PageCastMember[]): { tier: CastTier; label: string; people: PageCastMember[] }[] {
  return (['main', 'recurring', 'guest'] as CastTier[])
    .map((tier) => ({ tier, label: TIER_LABEL[tier], people: cast.filter((p) => p.tier === tier) }))
    .filter((g) => g.people.length > 0);
}

/**
 * The cast a page should print, most-present first.
 *
 * Sorted by episode count rather than TMDb's billing order, because billing order puts the actor
 * with the best agent first and this page is answering "who is in this and how much of it are they
 * in". Ties break on name so the same show renders identically twice — a page whose order drifts
 * between crawls looks like it changed when it did not.
 */
export function castForPage(cast: AggregateCastMember[], totalEpisodes: number): PageCastMember[] {
  return [...cast]
    .filter((p) => p.name && (p.character || p.characters?.length))
    .sort((a, b) => b.episodeCount - a.episodeCount || a.name.localeCompare(b.name))
    .slice(0, MAX_CAST)
    .map((p) => {
      const tier = tierFor(p.episodeCount, totalEpisodes);
      return {
        name: p.name,
        character: p.character || p.characters?.[0] || '',
        photo: p.photo,
        episodeCount: p.episodeCount,
        tier,
        billing: billingFor(p.episodeCount, totalEpisodes),
      };
    });
}
