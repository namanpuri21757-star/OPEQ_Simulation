import { BRIEFING_SLIDES } from '@shared/state';
import type { InstructorView } from '@shared/views';
import { Countdown } from '../ui';

/**
 * The line across the top of the live screen (SPEC 8.4).
 *
 * YEAR 5 | STATUS: Deciding | TIME LEFT 1:42 | SUBMITTED 7 / 9 | MESSAGING: OFF,
 * in one dense monospace row. During the briefing it reads BRIEFING | Screen 2
 * of 4 instead, because none of the other five fields mean anything yet.
 *
 * It is the one part of the dashboard a teacher reads without stopping talking,
 * so every field is a fixed width label and a fixed width figure: nothing in it
 * moves sideways when a number changes.
 */
const STATUS_WORDS: Record<InstructorView['phase'], string> = {
  LOBBY: 'Not started',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Deciding',
  PRACTICE_REVEAL: 'Practice results',
  YEAR_OPEN: 'Deciding',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Summit',
  ENDED: 'Finished',
};

export function StatusStrip({
  view,
  serverNow,
}: {
  view: InstructorView;
  serverNow(): number;
}) {
  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const submitted = view.teams.filter((team) => team.decision !== null).length;
  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';
  const messagingOn = view.messaging.filter((row) => row.on).length;

  if (view.phase === 'BRIEFING') {
    return (
      <header className="strip" role="group" aria-label="Where the game is">
        <span className="strip-item">
          <span className="strip-value">BRIEFING</span>
        </span>
        <span className="strip-item">
          <span className="strip-key">Screen</span>
          <span className="strip-value">
            {`${String(view.briefingSlide + 1)} of ${String(BRIEFING_SLIDES)}`}
          </span>
        </span>
      </header>
    );
  }

  return (
    <header className="strip" role="group" aria-label="Where the game is">
      <span className="strip-item">
        <span className="strip-key">Year</span>
        <span className="strip-value dash-year">{view.year === 0 ? 'PRACTICE' : view.year}</span>
      </span>

      <span className="strip-item">
        <span className="strip-key">Status</span>
        <span className="strip-value">{STATUS_WORDS[view.phase]}</span>
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
              closedLabel="0:00"
            />
          </span>
        </span>
      )}

      {open && (
        <span className="strip-item">
          <span className="strip-key">Submitted</span>
          <span className="strip-value">
            {`${String(submitted)} / ${String(view.teams.length)}`}
          </span>
        </span>
      )}

      <span className="strip-item strip-spacer">
        <span className="strip-key">Messaging</span>
        <span className={`strip-value ${messagingOn > 0 ? 'switch-on' : ''}`}>
          {messagingOn === 0
            ? 'OFF'
            : messagingOn === view.worlds.length
              ? 'ON'
              : `ON (${String(messagingOn)} of ${String(view.worlds.length)} worlds)`}
        </span>
      </span>
    </header>
  );
}
