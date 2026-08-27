import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  followShowNotifications,
  unfollowShowNotifications,
  followsShowNotifications,
  PUSH_CONFIGURED,
} from '../lib/notifications';
import {
  LEAD_PRESETS,
  DEFAULT_LEAD_MINUTES,
  MAX_LEAD_MINUTES,
  clampLead,
  formatLead,
  isPreset,
  readLead,
  writeLead,
  clearLead,
  splitLead,
  toMinutes,
  type LeadUnit,
} from '../lib/episodeAlerts';
import { useDismissible, useModalFocus } from './Sheet';
import { getShowDetails, getWatchProviders, watchRegion, type WatchOptions } from '../lib/tmdb';
import { fetchTvmazeChannel, type TvmazeChannel } from '../lib/tvmaze';

/**
 * The bell beside a show's title, and the card behind it.
 *
 * It sits against the title rather than out at the edge of the bar on purpose: it belongs to
 * *this show*, and an icon in the chrome's right-hand cluster reads as belonging to the app. The
 * title shrinks and ellipsises around it, so the bell stays put next to whatever fits.
 *
 * Replaces the toggle that used to live in the ⋯ menu. Two controls for one setting is how they
 * drift — the menu toggle had no lead time to show and would have started lying the moment this
 * card was used.
 *
 * A show with no TMDb id cannot be followed: there is nothing to check for new episodes against.
 * Without VAPID keys the whole feature stays hidden rather than offering a control that can only
 * fail. Both gates are the same ones the old toggle used.
 */

/**
 * Two states, drawn as two different bells rather than one bell in two weights.
 *
 * Struck-through means off and ringing means on in every interface anyone has used — a phone's
 * ringer, a chat app's mute, a calendar's alert. Reading the difference does not depend on
 * noticing that one shape is filled and the other is hollow, which is a distinction that survives
 * neither a small screen nor a quick glance, and vanishes entirely for anyone who cannot separate
 * the two oranges from each other.
 *
 * Colour still carries nothing on its own: the button's `aria-label` names the state, and the
 * card it opens says it in words.
 */
const BELL =
  'M12 3a6 6 0 00-6 6c0 3.6-1 5.1-1.7 5.9a.8.8 0 00.6 1.3h14.2a.8.8 0 00.6-1.3C19 14.1 18 12.6 18 9a6 6 0 00-6-6z';
const CLAPPER = 'M10 19a2 2 0 004 0';

function BellIcon({ on }: { on: boolean }) {
  const orange = 'var(--cta)';
  // Thinner than the bell's own outline: four arcs at the bell's weight closed the gaps between
  // them and the dome, and the whole thing read as one dense blob at 20px.
  const wave = { stroke: orange, strokeWidth: 1.45, strokeLinecap: 'round' as const };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Ringing: two arcs off each side, near then far, so the sound reads as travelling rather
          than as a bracket drawn around the bell. They sit high, in the corners: the dome is at
          its widest around the shoulder line and arcs placed level with it touch the outline at
          20px, which turns four separate marks into one dense shape. */}
      {on && (
        <>
          <path d="M5.0 7.6c0-1.5.6-2.9 1.6-3.8" {...wave} />
          <path d="M2.0 9.2c0-2.4.8-4.6 2.2-6.2" {...wave} />
          <path d="M19.0 7.6c0-1.5-.6-2.9-1.6-3.8" {...wave} />
          <path d="M22.0 9.2c0-2.4-.8-4.6-2.2-6.2" {...wave} />
        </>
      )}

      {/* The bell is scaled in both states, not only the ringing one. Sized to clear the outer
          wave, it would otherwise grow and shrink as you toggled it — a change of size reads as a
          different icon, which is the one thing the two states must not look like. */}
      <g transform="translate(12 12) scale(0.84) translate(-12 -12)">
        <path
          d={BELL}
          stroke={orange}
          strokeWidth={1.7 / 0.84}
          strokeLinejoin="round"
          fill={on ? orange : 'none'}
        />
        <path
          d={CLAPPER}
          stroke={orange}
          strokeWidth={1.7 / 0.84}
          strokeLinecap="round"
          fill={on ? orange : 'none'}
        />
      </g>

      {/* Silenced: one stroke, top-right down to bottom-left. Inset from the viewBox edges so the
          round caps aren't clipped by the 19px frame. */}
      {!on && <path d="M19.5 4.5l-15 15" stroke={orange} strokeWidth={1.7} strokeLinecap="round" />}
    </svg>
  );
}

type Choice = number | 'custom';

/** TMDb production statuses that mean more episodes are expected, whether or not one is dated. */
const STILL_RUNNING = new Set(['Returning Series', 'In Production', 'Planned']);

export default function EpisodeAlertButton({
  showTitle,
  showTmdbId,
}: {
  showTitle: string;
  showTmdbId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [following, setFollowing] = useState(false);
  const [lead, setLead] = useState<number | null>(null);
  const [expects, setExpects] = useState<'unknown' | 'yes' | 'no'>('unknown');

  useEffect(() => {
    let alive = true;
    // Gated here as well as at the return below: hooks run before the early return, so without
    // this the hidden bell would still put a request to /api/subscribe on every show you opened.
    if (!showTmdbId || !PUSH_CONFIGURED) { setFollowing(false); setLead(null); return; }
    setLead(readLead(showTmdbId));
    followsShowNotifications(showTmdbId)
      .then((v) => { if (alive) setFollowing(v); })
      .catch(() => { if (alive) setFollowing(false); });
    return () => { alive = false; };
  }, [showTmdbId]);

  /**
   * Whether this show can still deliver an episode to be alerted about.
   *
   * A finished show cannot, and offering to watch for new episodes of The Sopranos is a control
   * that can only ever do nothing — worse than absent, because it implies something might arrive.
   *
   * Two signals, because neither is sufficient. A dated next episode is proof. Failing that,
   * TMDb's production status carries shows that are between seasons with nothing scheduled yet,
   * which are exactly the shows someone most wants to be told about.
   *
   * `unknown` hides the bell rather than flashing one in and out on every show you open. A lookup
   * that comes back empty is treated as "yes": TMDb being unreachable is not evidence a show has
   * ended, and silently removing the control from a currently-airing show is the worse mistake.
   */
  useEffect(() => {
    let alive = true;
    if (!showTmdbId || !PUSH_CONFIGURED) { setExpects('unknown'); return; }
    setExpects('unknown');
    getShowDetails(showTmdbId)
      .then((d) => {
        if (!alive) return;
        if (!d) { setExpects('yes'); return; }
        setExpects(d.nextEpisodeAt || STILL_RUNNING.has(d.status) ? 'yes' : 'no');
      })
      .catch(() => { if (alive) setExpects('yes'); });
    return () => { alive = false; };
  }, [showTmdbId]);

  if (!showTmdbId || !PUSH_CONFIGURED) return null;
  // Still followed from an earlier season? Keep the control, or there is no way to turn it off.
  if (expects !== 'yes' && !following) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          following
            ? `New episode alerts on, ${formatLead(lead ?? DEFAULT_LEAD_MINUTES)}. Change`
            : 'Notify me about new episodes'
        }
        /**
         * No container. The 32px box is the tap target, not a visual — anything smaller is below
         * the size a thumb should be asked to hit, and the icon inside it is what is actually
         * seen. Colour does the work a surface was doing: this is the only orange in the bar.
         */
        style={{
          flex: 'none', width: 32, height: 32, marginLeft: 6, padding: 0,
          border: 'none', background: 'transparent', borderRadius: 999, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          // Optically aligned rather than centred. Flex centres the 32px box against the heading's
          // line box, but the bell's visual mass sits above its own centre — the clapper is a thin
          // tail — so geometric centring reads as riding high next to the title's x-height.
          // `relative` so the nudge costs no layout.
          position: 'relative', top: 2,
        }}
      >
        <BellIcon on={following} />
      </button>

      {open && (
        <AlertCard
          showTitle={showTitle}
          showTmdbId={showTmdbId}
          following={following}
          lead={lead}
          onClose={() => setOpen(false)}
          onSaved={(next) => { setFollowing(true); setLead(next); setOpen(false); }}
          onCleared={() => { setFollowing(false); setLead(null); setOpen(false); }}
        />
      )}
    </>
  );
}

function AlertCard({
  showTitle,
  showTmdbId,
  following,
  lead,
  onClose,
  onSaved,
  onCleared,
}: {
  showTitle: string;
  showTmdbId: number;
  following: boolean;
  lead: number | null;
  onClose: () => void;
  onSaved: (minutes: number) => void;
  onCleared: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  useDismissible(onClose);
  useModalFocus(cardRef);

  const initial = following && lead !== null ? lead : DEFAULT_LEAD_MINUTES;
  const [choice, setChoice] = useState<Choice>(isPreset(initial) ? initial : 'custom');
  const [custom, setCustom] = useState(() => splitLead(isPreset(initial) ? 15 : initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /**
   * Roving tabindex over the options, which is what a radio group is supposed to do: one stop on
   * the way through with Tab, and the arrows move the selection inside it. Without this every
   * option is a tab stop and a keyboard user pages through five of them to reach the buttons.
   */
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const options: Choice[] = [...LEAD_PRESETS.map((p) => p.minutes), 'custom'];
  const index = options.findIndex((o) => o === choice);

  const move = (delta: number) => {
    const next = (index + delta + options.length) % options.length;
    setChoice(options[next]);
    optionRefs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };

  const minutes = choice === 'custom' ? toMinutes(custom.value, custom.unit) : choice;
  const customInvalid =
    choice === 'custom' && (!Number.isFinite(custom.value) || custom.value < 0 || minutes > MAX_LEAD_MINUTES);

  const save = async () => {
    if (customInvalid) return;
    setBusy(true);
    setError('');
    try {
      const chosen = clampLead(minutes);
      // False means the browser's permission prompt was declined — not an error, and not
      // something to report as one. The card stays open so the choice isn't lost.
      const ok = await followShowNotifications(showTmdbId, chosen);
      if (!ok) { setError('Your browser blocked notifications for this site.'); return; }
      writeLead(showTmdbId, chosen);
      onSaved(chosen);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that notification setting');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError('');
    try {
      await unfollowShowNotifications(showTmdbId);
      clearLead(showTmdbId);
      onCleared();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn notifications off');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Portalled to `.ct-app`, which is where every other overlay in this app already lives.
   *
   * Two reasons, both found the hard way. The bell sits inside `.ct-topbar`, a 60px-tall flex
   * item, so rendering in place gave a scrim clipped to the height of the bar and a card sliced
   * off two lines in. And the theme is a set of CSS custom properties applied as inline styles on
   * `.ct-app` itself — portal to `document.body` instead and every `var(--sheet)` resolves to
   * nothing, which paints a transparent card over the cast grid. `.ct-app` is also the
   * `position: relative` ancestor that `.ct-scrim`'s `inset: 0` is written against.
   */
  const host = typeof document === 'undefined' ? null : document.querySelector('.ct-app');
  if (!host) return null;

  return createPortal(
    <div
      className="ct-scrim"
      style={{ alignItems: 'flex-start', justifyContent: 'center', padding: '76px 16px 16px' }}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ct-alert-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 340, maxHeight: '100%', overflowY: 'auto',
          background: 'var(--sheet)', borderRadius: 20, padding: '20px 18px 18px',
          boxShadow: 'var(--shadow-lift)',
        }}
      >
        <div id="ct-alert-title" className="ct-sheet-title" style={{ marginBottom: 4 }}>
          New episode alerts
        </div>
        {/* Names the show, because the bell sits next to a title that the card covers. */}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: 16 }}>
          We&rsquo;ll notify you when a new episode of <strong style={{ color: 'var(--text)' }}>{showTitle}</strong> is
          about to come on.
        </div>

        <div
          role="radiogroup"
          aria-labelledby="ct-alert-title"
          onKeyDown={onKeyDown}
          style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}
        >
          {LEAD_PRESETS.map((preset, i) => (
            <Option
              key={preset.minutes}
              innerRef={(el) => { optionRefs.current[i] = el; }}
              label={preset.label}
              selected={choice === preset.minutes}
              onSelect={() => setChoice(preset.minutes)}
            />
          ))}
          <Option
            innerRef={(el) => { optionRefs.current[LEAD_PRESETS.length] = el; }}
            label="Custom…"
            selected={choice === 'custom'}
            onSelect={() => setChoice('custom')}
          />
        </div>

        {/* Revealed rather than always shown: four presets and two form controls at once is a lot
            of card for a decision most people make by tapping the second row. */}
        {choice === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '10px 0 2px', paddingLeft: 30 }}>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_LEAD_MINUTES}
              value={Number.isFinite(custom.value) ? custom.value : ''}
              onChange={(e) => setCustom((c) => ({ ...c, value: e.target.valueAsNumber }))}
              aria-label="How long before"
              className="ct-input"
              style={{ width: 84, flex: 'none' }}
            />
            <select
              value={custom.unit}
              onChange={(e) => setCustom((c) => ({ ...c, unit: e.target.value as LeadUnit }))}
              aria-label="Unit"
              className="ct-input"
              style={{ flex: 1, minWidth: 0 }}
            >
              <option value="minutes">minutes before</option>
              <option value="hours">hours before</option>
              <option value="days">days before</option>
            </select>
          </div>
        )}
        {customInvalid && (
          <div style={{ fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.45, marginTop: 8 }}>
            Choose between 0 minutes and 4 weeks before.
          </div>
        )}

        <WhereToWatch showTmdbId={showTmdbId} />

        {error && (
          <div role="alert" style={{ fontSize: 12.5, color: 'var(--danger)', lineHeight: 1.45, marginTop: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} className="ct-btn-ghost" style={{ flex: 1, height: 44 }} disabled={busy}>
            Cancel
          </button>
          <button
            onClick={save}
            className="ct-btn-primary ct-btn-primary-calm"
            style={{ flex: 1, height: 44 }}
            disabled={busy || customInvalid}
          >
            {busy ? 'Saving…' : following ? 'Save' : 'Turn on'}
          </button>
        </div>

        {/* Only when there is something to turn off, and last, because it is the one action here
            that throws away a setting rather than changing it. */}
        {following && (
          <button
            onClick={turnOff}
            disabled={busy}
            style={{
              width: '100%', height: 40, marginTop: 8, border: 'none', borderRadius: 12,
              background: 'transparent', color: 'var(--danger)', fontSize: 13.5, fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Turn off notifications
          </button>
        )}
      </div>
    </div>,
    host,
  );
}

/**
 * One row of the radio group.
 *
 * A button rather than a real `<input type="radio">` so the whole row is the target — 44px of it,
 * which is the smallest thing a thumb should be asked to hit — while `role="radio"` and
 * `aria-checked` keep the semantics an input would have given for free.
 */
const Option = ({
  innerRef,
  label,
  selected,
  onSelect,
}: {
  innerRef: (el: HTMLButtonElement | null) => void;
  label: string;
  selected: boolean;
  onSelect: () => void;
}) => (
  <button
    ref={innerRef}
    role="radio"
    aria-checked={selected}
    tabIndex={selected ? 0 : -1}
    onClick={onSelect}
    style={{
      display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
      padding: '0 6px', border: 'none', borderRadius: 12, background: 'transparent',
      textAlign: 'left', cursor: 'pointer',
      fontSize: 14.5, color: 'var(--text)',
    }}
  >
    <span
      aria-hidden="true"
      style={{
        flex: 'none', width: 20, height: 20, borderRadius: 999,
        border: `2px solid ${selected ? 'var(--accent)' : 'var(--input-border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {selected && <span style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--accent)' }} />}
    </span>
    <span>{label}</span>
  </button>
);


/**
 * Where the show can be watched, under the alert options.
 *
 * The question this answers is a real one and it is not the same question as "tell me when it is
 * on": knowing an episode has landed is no use if you cannot remember which of nine services
 * carries it. Being told at the moment you set the reminder is the cheapest possible time to
 * answer it.
 *
 * Below the options, not above: choosing a lead time is what the card is for, and a row of logos
 * at the top would be the first thing read every time it opened.
 *
 * Fails quietly. This is supporting information — a card that shows an error where a logo should
 * be is worse than a card that simply doesn't mention it.
 */
function WhereToWatch({ showTmdbId }: { showTmdbId: number }) {
  const [state, setState] = useState<{
    status: 'loading' | 'done';
    data: WatchOptions | null;
    channel: TvmazeChannel | null;
  }>({ status: 'loading', data: null, channel: null });

  /**
   * JustWatch first, TVmaze as the backstop, and only ever one of them shown.
   *
   * TMDb's providers answer the better question — what a person in this country can actually open
   * tonight, with the buy-and-rent case separated out — so nothing else is fetched when they come
   * back. They are also frequently empty: no data for the region, or none for the show at all, and
   * "No streaming service listed" is a poor answer when the show is an Amazon original and every
   * other source knows it.
   *
   * The fallback is deliberately sequential rather than parallel. Two requests on every card open
   * to use one of them is a cost paid on the common path for the uncommon one.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      let providers: WatchOptions | null = null;
      try {
        providers = await getWatchProviders(showTmdbId);
      } catch {
        providers = null;
      }
      if (!alive) return;

      if (providers && (providers.stream.length || providers.free.length || providers.buyOnly)) {
        setState({ status: 'done', data: providers, channel: null });
        return;
      }

      const channel = await fetchTvmazeChannel(showTmdbId);
      if (alive) setState({ status: 'done', data: providers, channel });
    })();
    return () => { alive = false; };
  }, [showTmdbId]);

  if (state.status === 'loading') {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="ct-label-muted">WHERE TO WATCH</div>
        <div className="ct-skeleton" style={{ height: 28, borderRadius: 8, marginTop: 6 }} />
      </div>
    );
  }

  const d = state.data;
  const services = d ? [...d.stream, ...d.free] : [];
  const region = d?.region ?? watchRegion();
  const fallback = state.channel;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="ct-label-muted">WHERE TO WATCH</div>

      {services.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
          {services.map((p) => (
            <span
              key={p.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 5px',
                border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)',
                fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: '100%',
              }}
            >
              {p.logo ? (
                <img
                  src={p.logo}
                  alt=""
                  width={20}
                  height={20}
                  /* A logo that fails to load leaves the browser's broken-image glyph sitting in a
                     row of brand marks, which looks like the app is broken rather than the image.
                     The name beside it is the part that answers the question anyway. */
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  style={{ borderRadius: 5, flex: 'none', display: 'block' }}
                />
              ) : (
                <span style={{ width: 20, height: 20, borderRadius: 5, background: 'var(--border)', flex: 'none' }} />
              )}
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
            </span>
          ))}
        </div>
      ) : fallback?.channel ? (
        /* Worded for what TVmaze actually knows. "Streams on Prime Video" is true wherever you
           are; "available in your country" would not be, and this data cannot tell the difference.
           The buy-or-rent case still wins when JustWatch reported it, because that IS an answer
           about availability here. */
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, marginTop: 2 }}>
          {fallback.kind === 'web' ? 'Streams on ' : 'Airs on '}
          <strong style={{ color: 'var(--text)' }}>{fallback.channel}</strong>
          {d?.buyOnly ? `. Also available to buy or rent in ${region}.` : ''}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', lineHeight: 1.45, marginTop: 2 }}>
          {d?.buyOnly
            ? `Only available to buy or rent in ${region}.`
            : `No streaming service listed for ${region}.`}
        </div>
      )}

      {/* JustWatch attribution is a condition of TMDb serving this data, not a nicety. The link
          also earns its place: which services carry a show changes on licensing deals, and this
          is the page that is right today. */}
      {services.length === 0 && fallback?.channel ? (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>Channel via TVmaze</div>
      ) : d?.link ? (
        <a
          href={d.link}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}
        >
          {region} listings via <span style={{ textDecoration: 'underline' }}>JustWatch</span>
        </a>
      ) : (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>Listings via JustWatch</div>
      )}
    </div>
  );
}
