import { useMemo } from 'react';
import { useStore } from '../hooks/useStore';
import { useUI } from '../hooks/useUI';
import { findDuplicateGroups, planResolution, mergeGroup } from '../lib/duplicateShows';
import { isDisposable } from '../lib/castValue';
import { posterStyle, initials } from '../lib/utils';
import Sheet from './Sheet';

/**
 * The one duplicate case the app won't decide for you: two copies of a show, both holding records
 * you typed.
 *
 * Everything else resolves silently during sync — a copy with nothing of yours in it is deleted
 * without asking, because the question would be meaningless. This screen exists only when deleting
 * either copy would lose something, and it says how much is at stake on each side rather than
 * asking you to guess.
 *
 * Derived from the store rather than handed state: the same rule that queued the group evaluates
 * here, so the sheet cannot disagree with what sync decided, and it empties itself the moment the
 * groups are resolved.
 */
export default function DuplicateShowsSheet() {
  const { data, updateData } = useStore();
  const { duplicatesOpen, closeDuplicates } = useUI();

  const groups = useMemo(
    () => findDuplicateGroups(data).filter((g) => planResolution(g) === null),
    [data],
  );

  if (!duplicatesOpen) return null;

  const merge = (tmdbId: number, keepId: string) => {
    updateData((d) => { mergeGroup(d, tmdbId, keepId); });
  };

  const keepOnly = (tmdbId: number, keepId: string) => {
    updateData((d) => { d.shows = d.shows.filter((s) => s.tmdbId !== tmdbId || s.id === keepId); });
  };

  return (
    <Sheet onClose={closeDuplicates} label="Duplicate shows">
      <div className="ct-sheet-title">Two copies of the same show</div>

      {groups.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 22 }}>
          Nothing left to sort out.
        </div>
      ) : (
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 22 }}>
          This happens when a show was added separately on two devices before they first synced.
          Both copies here hold characters you wrote, so nothing is deleted without you saying so.
        </div>
      )}

      {groups.map((group) => {
        const show = data.shows.find((s) => s.id === group.shows[0].id);
        return (
          <div key={group.tmdbId} style={{ marginBottom: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, flex: 'none', backgroundColor: show?.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'rgba(255,255,255,0.85)', ...posterStyle(show?.poster, show?.posterCrop) }}>
                {!show?.poster && initials(group.title)}
              </div>
              <div className="ct-heading" style={{ fontSize: 18 }}>{group.title}</div>
            </div>

            {/* Merging first, and given the filled button: it is the only option here that loses
                nothing. Keeping one copy is offered underneath for the case where one of them is
                a false start you'd rather be rid of. */}
            <button
              onClick={() => merge(group.tmdbId, group.shows[0].id)}
              className="ct-btn-primary ct-btn-primary-calm"
              style={{ width: '100%', marginBottom: 12 }}
            >
              Merge into one show
            </button>

            {group.shows.map((copy) => {
              /**
               * Named, because "Keep only this copy" twice under one title is not a choice.
               *
               * Both rows say the same show and similar counts, so the only thing that tells them
               * apart is who is in them — which is also the thing you'd actually be deciding
               * between. Whoever you wrote first is the most recognisable handle on a copy.
               */
              const copyShow = data.shows.find((s) => s.id === copy.id);
              const written = (copyShow?.cast ?? [])
                .filter((c) => !isDisposable(c))
                .map((c) => c.nickname?.trim() || c.name?.trim())
                .filter(Boolean)
                .slice(0, 3);

              return (
                <button
                  key={copy.id}
                  onClick={() => keepOnly(group.tmdbId, copy.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, width: '100%',
                    border: 'none', background: 'none', padding: '13px 2px', cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 15, color: 'var(--text)' }}>
                    Keep the copy with {written.length ? written.join(', ') : `${copy.kept} of your characters`}
                    {copy.kept > written.length && ` +${copy.kept - written.length} more`}
                  </span>
                  <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                    {copy.kept} {copy.kept === 1 ? 'character' : 'characters'} you wrote
                    {copy.castTotal > copy.kept && `, ${copy.castTotal - copy.kept} auto-loaded`}
                    {' — the other copy is deleted'}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}

      <button onClick={closeDuplicates} className="ct-btn-ghost" style={{ width: '100%', marginTop: 8 }}>
        {groups.length === 0 ? 'Done' : 'Decide later'}
      </button>
    </Sheet>
  );
}
