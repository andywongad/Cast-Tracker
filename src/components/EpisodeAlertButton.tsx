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

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3a6 6 0 00-6 6c0 3.6-1 5.1-1.7 5.9a.8.8 0 00.6 1.3h14.2a.8.8 0 00.6-1.3C19 14.1 18 12.6 18 9a6 6 0 00-6-6z"
        stroke={on ? 'var(--accent)' : 'var(--text-secondary)'}
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill={on ? 'var(--accent)' : 'none'}
      />
      <path
        d="M10 19a2 2 0 004 0"
        stroke={on ? 'var(--accent)' : 'var(--text-secondary)'}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

type Choice = number | 'custom';

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

  if (!showTmdbId || !PUSH_CONFIGURED) return null;

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
        style={{
          flex: 'none', width: 30, height: 30, marginLeft: 2, padding: 0,
          border: 'none', borderRadius: 999, background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
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
