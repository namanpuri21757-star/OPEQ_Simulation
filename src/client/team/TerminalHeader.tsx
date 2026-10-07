import type { TeamView } from '@shared/views';
import type { ConnectionStatus } from '../net';
import { Badge, Countdown } from '../ui';

/**
 * The strip along the top of every team screen (SPEC 8.3): who we are, which
 * year it is, what is happening, how long is left and whether we are connected.
 *
 * It is always on screen during an open year, together with the decision box,
 * because those are the two things a group looks at every few seconds.
 */
const PHASE_WORDS: Record<TeamView['phase'], string> = {
  LOBBY: 'Waiting to start',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Practice year is open',
  PRACTICE_REVEAL: 'Practice results',
  YEAR_OPEN: 'Year is open',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Talking time',
  ENDED: 'Game over',
};

const STATUS_WORDS: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  online: 'Connected',
  offline: 'Reconnecting',
  refused: 'Not connected',
};

export function phaseWords(view: TeamView): string {
  if (view.phase === 'BETWEEN') {
    return view.between?.kind === 'summit' ? 'Summit' : 'Chat window';
  }
  return PHASE_WORDS[view.phase];
}

export interface TerminalHeaderProps {
  view: TeamView;
  status: ConnectionStatus;
  serverNow(): number;
}

export function TerminalHeader({ view, status, serverNow }: TerminalHeaderProps) {
  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const started = view.phase !== 'LOBBY' && view.phase !== 'BRIEFING';

  return (
    <header className="terminal-header">
      <div className="terminal-who">
        <Badge letter={view.letter} size="large" />
        <div>
          <h1 className="terminal-country">{view.countryName}</h1>
          <p className="terminal-label">{view.label}</p>
        </div>
      </div>

      <div className="terminal-when">
        {/* Before the practice year opens there is no year to name yet, and
            "PRACTICE" over an empty lobby reads like something has started. */}
        {started && (
          <p className="terminal-year">{view.isPractice ? 'PRACTICE' : view.yearLabel}</p>
        )}
        <p className="terminal-phase">{phaseWords(view)}</p>
      </div>

      <div className="terminal-clock">
        {timed && (
          <Countdown
            deadline={view.timing.deadline}
            remainingMs={view.timing.remainingMs}
            paused={view.timing.paused}
            serverNow={serverNow}
          />
        )}
        <p className={`terminal-status terminal-status-${status}`}>
          <span aria-hidden="true">{status === 'online' ? '●' : '○'}</span> {STATUS_WORDS[status]}
        </p>
      </div>
    </header>
  );
}
