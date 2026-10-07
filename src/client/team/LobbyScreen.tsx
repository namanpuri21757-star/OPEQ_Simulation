import type { TeamView } from '@shared/views';
import { Badge } from '../ui';

/** Before the briefing starts (SPEC 8.3). Nothing to do but be in the right seat. */
export function LobbyScreen({ view }: { view: TeamView }) {
  return (
    <section className="panel lobby" aria-labelledby="lobby-heading">
      <h2 id="lobby-heading">Waiting for your teacher to start</h2>
      <p className="lobby-team">
        <Badge letter={view.letter} size="large" withName />
      </p>
      <p>{`You are ${view.label}. Keep this computer on this screen.`}</p>

      <h3>Your group</h3>
      {view.members.length === 0 ? (
        <p className="hint">No names yet. That is fine - you can play without them.</p>
      ) : (
        <ul className="member-list">
          {view.members.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
