import { useStore } from '../hooks/useStore';
import type { Show } from '../types';

/**
 * Offers to mark a show completed when you're looking at its last episode.
 *
 * Deliberately not an inference about what you have watched. The app has no watched-tracker: the
 * season and episode pills are a browsing filter, `mapEpisode` is overwritten on every tap and
 * reset to '' when the season changes, so there is no high-water mark and no way to reconstruct
 * one from existing data. Anything claiming "you've finished this" would be guessing, and would
 * guess wrong for exactly the behaviour this app exists for — jumping to the finale to look up who
 * somebody was.
 *
 * So this asserts only what it can see: this is the last episode, and TMDb says the show has
 * ended. Whether that means you're done is the one question the user is better placed to answer,
 * which is why it is asked rather than assumed.
 */

const DISMISSED_KEY = 'ct.finishedprompt.v1';

/**
 * Dismissals live in their own key, not on the show record.
 *
 * "I don't want to be asked about this" is a fact about the prompt, not about the show, and
 * ct.v2 holds data a user would expect an export to carry. Keeping it out also means this feature
 * touches no part of the stored schema at all — the same reason `ct.firstseason.v1` is separate.
 */
function dismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as string[]) : [];
  } catch {
    return [];
  }
}

export function isDismissed(showId: string): boolean {
  return dismissed().includes(showId);
}

function dismiss(showId: string) {
  try {
    const list = dismissed();
    if (!list.includes(showId)) localStorage.setItem(DISMISSED_KEY, JSON.stringify([...list, showId]));
  } catch {
    /* Losing a dismissal means being asked once more, which is survivable. */
  }
}

/** Show statuses that mean there is a final episode at all. */
const ENDED = new Set(['Ended', 'Canceled', 'Cancelled']);

export function shouldOfferCompletion(opts: {
  show: Show | undefined;
  tmdbStatus: string;
  seasons: number[];
  currentSeason: number;
  currentEpisode: number;
  episodeCount: number;
}): boolean {
  const { show, tmdbStatus, seasons, currentSeason, currentEpisode, episodeCount } = opts;
  if (!show || show.status === 'completed') return false;
  if (!ENDED.has(tmdbStatus)) return false;
  /**
   * Reality is excluded outright. Its seasons are separate casts with separate contestants —
   * finishing Single's Inferno season 4 says nothing about whether you are finished with the
   * show — so reaching the end of one carries none of the meaning it does for a serial.
   */
  if (show.type !== 'DRAMA') return false;
  // Needs real data on both sides. A placeholder season list or an unknown episode count would
  // otherwise make "the last one" true at the wrong moment.
  if (!seasons.length || !episodeCount) return false;
  if (currentSeason !== Math.max(...seasons)) return false;
  if (currentEpisode !== episodeCount) return false;
  return !isDismissed(show.id);
}

export default function FinishedPrompt({ show, onDismiss }: { show: Show; onDismiss: () => void }) {
  const { updateData } = useStore();

  const complete = () => {
    const id = show.id;
    updateData((d) => {
      const s = d.shows.find((x) => x.id === id);
      if (s) s.status = 'completed';
    });
    // Also recorded as dismissed: un-completing the show later shouldn't bring the question back
    // on the same episode it was already answered for.
    dismiss(id);
    onDismiss();
  };

  const notNow = () => { dismiss(show.id); onDismiss(); };

  return (
    <div
      style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
        padding: '12px 14px', marginBottom: 14, borderRadius: 14,
        background: 'var(--accent-tint)', border: '1px solid var(--border)',
      }}
    >
      <div style={{ flex: '1 1 200px', minWidth: 0, fontSize: 13.5, lineHeight: 1.45, color: 'var(--text-secondary)' }}>
        {/* States the observation, not a conclusion about the user. */}
        That&rsquo;s the last episode of {show.title}.
      </div>
      <div style={{ display: 'flex', gap: 8, flex: 'none' }}>
        <button onClick={complete} className="ct-btn-primary" style={{ height: 36, padding: '0 14px', borderRadius: 10, fontSize: 13 }}>
          Mark completed
        </button>
        <button onClick={notNow} className="ct-btn-ghost" style={{ height: 36, padding: '0 12px', borderRadius: 10, fontSize: 13 }}>
          Not now
        </button>
      </div>
    </div>
  );
}
