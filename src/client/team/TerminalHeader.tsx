import { formatProfitK } from '@shared/units';
import type { TeamView } from '@shared/views';
import { envoyNames } from '@shared/roles';
import type { ConnectionStatus } from '../net';
import { Badge, Countdown } from '../ui';

/**
 * The strip along the top of every team screen (SPEC 8.3).
 *
 * Who we are, which year it is, what to do, how long is left and the one number
 * that is the point of the whole game: total profit. Nothing else earns a place
 * up here, because a group glances at this line every few seconds with a timer
 * running.
 *
 * Roles sit on their own line underneath, because they change once every few
 * years and the strip changes every second.
 */
const STATUS_WORDS: Record<TeamView['phase'], string> = {
  LOBBY: 'Waiting',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Decide',
  PRACTICE_REVEAL: 'Results',
  YEAR_OPEN: 'Decide',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Summit',
  ENDED: 'Finished',
};

export function statusWord(view: TeamView): string {
  // A group that has sent its number is waiting, not deciding, and the word has
  // to say so or the screen looks like it still wants something.
  if ((view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN') && view.decision !== null) {
    return 'Waiting';
  }
  return STATUS_WORDS[view.phase];
}

/** The total over scored years, which is the last row's running total. */
export function totalProfitK(view: TeamView): number {
  const scored = view.history.filter((record) => !record.isPractice);
  const last = scored[scored.length - 1];
  return last ? last.cumulativeProfitK : 0;
}

export interface TerminalHeaderProps {
  view: TeamView;
  status: ConnectionStatus;
  serverNow(): number;
}

export function TerminalHeader({ view, status, serverNow }: TerminalHeaderProps) {
  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const started = view.phase !== 'LOBBY' && view.phase !== 'BRIEFING';
  const envoys = envoyNames(view.roles);

  return (
    <>
      <header className="strip" role="group" aria-label="Your country and the clock">
        <span className="strip-item team-who">
          <Badge letter={view.letter} />
          <span className="team-country">{view.countryName}</span>
          <span className="strip-key team-world">{`World ${String(view.worldNumber)}`}</span>
        </span>

        {started && (
          <span className="strip-item">
            <span className="strip-key">Year</span>
            <span className="strip-value team-year">
              {view.isPractice ? 'PRACTICE' : view.year}
            </span>
          </span>
        )}

        <span className="strip-item">
          <span className="strip-key">Status</span>
          <span className="strip-value">{statusWord(view)}</span>
        </span>

        {timed && (
          <span className="strip-item">
            <span className="strip-key">Time left</span>
            <span className="strip-clock">
              <Countdown
                deadline={view.timing.deadline}
                remainingMs={view.timing.remainingMs}
                paused={view.timing.paused}
                serverNow={serverNow}
              />
            </span>
          </span>
        )}

        <span className="strip-item strip-spacer">
          <span className="strip-key">Your total profit</span>
          <span className="strip-value">{formatProfitK(totalProfitK(view))}</span>
        </span>

        <span className="strip-item">
          <span className={`dot ${status === 'online' ? 'dot-on' : 'dot-off'}`} aria-hidden="true">
            &#9679;
          </span>
          <span className="strip-key team-status">
            {status === 'online' ? 'Connected' : 'Offline'}
          </span>
        </span>
      </header>

      <p className="team-roles">
        {`At the keyboard: ${view.roles.operator}`}
        {envoys === '' ? '' : ` · Envoy: ${envoys}`}
      </p>
    </>
  );
}
