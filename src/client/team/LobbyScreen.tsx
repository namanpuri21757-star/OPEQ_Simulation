import type { TeamView } from '@shared/views';
import { Badge } from '../ui';

/** Before the briefing starts (SPEC 8.3). Nothing to do but be in the right seat. */
export function LobbyScreen({ view }: { view: TeamView }) {
  return (
    <section className="box" aria-labelledby="lobby-heading">
      <p className="obs-period" id="lobby-heading">
        Waiting for your teacher to start
      </p>
      <p style={{ marginTop: 'var(--s4)' }}>
        <Badge letter={view.letter} size="large" withName />
      </p>
      <p className="lede" style={{ marginTop: 'var(--s4)' }}>
        {`You are ${view.label}. Keep this computer on this screen.`}
      </p>

      {view.members.length > 0 && (
        <p className="note" style={{ marginTop: 'var(--s4)' }}>
          {`Your group: ${view.members.join(', ')}`}
        </p>
      )}
    </section>
  );
}
