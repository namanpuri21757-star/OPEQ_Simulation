import { useState } from 'react';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, Confirm, type Say } from '../ui';

/**
 * Starting over, and clearing up afterwards (SPEC 8.4).
 *
 * Both ask for a word to be typed, because both throw away work a class did and
 * a mis-aimed click must not be enough. The difference between them is spelled
 * out in the dialog, since "reset" and "delete" sound alike in a hurry:
 *
 *  - Reset keeps the teams, their codes and their claimed computers, so the same
 *    class can play again without reprinting anything.
 *  - Delete removes the saved data from this computer for good.
 */
export interface DangerZoneProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
  /** Called after a delete, so the screen can forget the session. */
  onDeleted(): void;
}

export function DangerZone({ view, send, onSaid, onDeleted }: DangerZoneProps) {
  const [asking, setAsking] = useState<'reset' | 'delete' | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    const ack = await send('resetSession', { confirm: 'RESET' });
    setBusy(false);
    setAsking(null);
    onSaid(
      ack.ok ? 'Back to the lobby. The teams kept their codes.' : ack.message,
      ack.ok ? 'good' : 'bad',
    );
  };

  const remove = async () => {
    setBusy(true);
    const ack = await send('deleteSession', { confirm: 'DELETE' });
    setBusy(false);
    setAsking(null);
    if (ack.ok) onDeleted();
    else onSaid(ack.message, 'bad');
  };

  return (
    <details className="danger">
      <summary>Start over, or clear up</summary>
      <p className="note">
        Both of these throw work away, so both ask you to type a word first. Neither can be undone.
      </p>
      <div className="btn-row">
        <Button onClick={() => setAsking('reset')}>Play again with this class</Button>
        <Button onClick={() => setAsking('delete')}>Delete this game&rsquo;s data</Button>
      </div>

      {asking === 'reset' && (
        <Confirm
          title="Play again with this class?"
          typed="RESET"
          confirmLabel="Reset the game"
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={() => void reset()}
        >
          <p>
            Every decision, result, message and note is cleared and the game goes back to the lobby.
            The teams keep their join codes, their names and the computers they are on, so nothing
            has to be handed out again.
          </p>
        </Confirm>
      )}

      {asking === 'delete' && (
        <Confirm
          title="Delete this game’s data?"
          typed="DELETE"
          confirmLabel="Delete it"
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={() => void remove()}
        >
          <p>
            {`Everything saved for session ${view.sessionId} is removed from this computer, including the reflections the groups wrote. Every screen in the room goes back to the start.`}
          </p>
          <p>Do this after the lesson, once you have the exports you want.</p>
        </Confirm>
      )}
    </details>
  );
}
