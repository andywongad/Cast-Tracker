/**
 * Opens the previous episode's recap.
 *
 * Labelled rather than an icon, and a single tap rather than a gesture. A double-tap shortcut
 * exists on the episode chips for people who find it, but it cannot be the only way in: keyboard
 * users have no double-tap, and on iOS VoiceOver double-tap *is* the activation gesture, so a
 * screen-reader user physically cannot perform one in the app's sense.
 */
export default function RecapButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 24,
        border: 'none', background: 'none', padding: '2px 0', cursor: 'pointer',
        fontSize: 12.5, fontWeight: 700, color: 'var(--accent-soft)',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.4" />
        <path d="M8 7.2v4M8 4.9v.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      Previously
    </button>
  );
}
