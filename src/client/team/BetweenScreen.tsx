import type { TeamView } from '@shared/views';
import { envoyNames } from '@shared/roles';
import type { SendCommand } from '../net';
import { Banner, Countdown, type Say } from '../ui';
import { HistoryPanel } from './HistoryPanel';
import { MessagesPanel } from './MessagesPanel';

/**
 * The summit: the Envoys get up and meet away from the computers (SPEC 6).
 *
 * The talking happens in the room, so the screen says who goes and shows the
 * clock, and otherwise keeps out of the way. Whether anything can be typed into
 * the messages panel is the server's decision, which is now one plain switch.
 */
export interface BetweenScreenProps {
  view: TeamView;
  send: SendCommand;
  serverNow(): number;
  onSaid?: Say | undefined;
}

export function BetweenScreen({ view, send, serverNow, onSaid }: BetweenScreenProps) {
  const envoys = envoyNames(view.roles);

  return (
    <div className="stack">
      {view.finalYearAnnounced && (
        <Banner tone="alert" title="Final year">
          Your teacher says this is the final year.
        </Banner>
      )}

      <section className="box" aria-labelledby="between-heading">
        <p className="obs-period" id="between-heading">
          Summit
        </p>
        <p className="obs-value">
          <Countdown
            deadline={view.timing.deadline}
            remainingMs={view.timing.remainingMs}
            paused={view.timing.paused}
            serverNow={serverNow}
            closedLabel="Time is up"
          />
        </p>
        <p className="lede" style={{ marginTop: 'var(--s4)' }}>
          {envoys === ''
            ? 'Your Envoy meets the other two Envoys away from the computers.'
            : `${envoys}: go to the meeting point. Everyone else stays here and thinks about the next year.`}
        </p>
      </section>

      <MessagesPanel view={view} send={send} onSaid={onSaid} serverNow={serverNow} />
      <HistoryPanel view={view} />
    </div>
  );
}
