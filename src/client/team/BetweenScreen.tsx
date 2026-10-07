import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Banner, Countdown, type Say } from '../ui';
import { DecisionPanel } from './DecisionPanel';
import { MessagesPanel } from './MessagesPanel';
import { NewsPanel } from './NewsPanel';
import { RolesLine } from './RolesLine';

/**
 * The time between years: a chat window, or a summit where the Envoys get up and
 * meet (SPEC section 6).
 *
 * At a summit the talking happens in the room, so the screen says where to go and
 * shows the clock. Whether the chat panel can be written in is the server's
 * decision (chatOpen), which already accounts for the chat mode and for a mute.
 */
export interface BetweenScreenProps {
  view: TeamView;
  send: SendCommand;
  serverNow(): number;
  onSaid?: Say | undefined;
}

export function BetweenScreen({ view, send, serverNow, onSaid }: BetweenScreenProps) {
  const summit = view.between?.kind === 'summit';

  return (
    <>
      {view.finalYearAnnounced && (
        <Banner tone="warning" title="Final year">
          Your teacher says this is the final year.
        </Banner>
      )}

      <section className="panel between" aria-labelledby="between-heading">
        <h2 id="between-heading">{summit ? 'Envoys: go to the meeting point' : 'Chat window'}</h2>
        <p className="between-clock">
          <Countdown
            deadline={view.timing.deadline}
            remainingMs={view.timing.remainingMs}
            paused={view.timing.paused}
            serverNow={serverNow}
            closedLabel="Time is up"
          />
        </p>
        <p>
          {summit
            ? 'Your Envoy meets the other two Envoys away from the computers. Everyone else stays here and thinks about the next year.'
            : 'You can write to the other two countries in your world until the timer stops.'}
        </p>
        <RolesLine roles={view.roles} />
      </section>

      <div className="columns">
        <div className="column-main">
          <MessagesPanel view={view} send={send} onSaid={onSaid} />
        </div>
        <div className="column-side">
          <NewsPanel view={view} />
          <DecisionPanel view={view} send={send} onSaid={onSaid} />
        </div>
      </div>
    </>
  );
}
