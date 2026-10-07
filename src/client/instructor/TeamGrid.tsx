import type { InstructorTeamView, InstructorView } from '@shared/views';
import { COUNTRY_LETTERS, COUNTRY_NAMES } from '@shared/constants';
import { formatQuantity } from '@shared/units';
import { Badge, Button } from '../ui';
import { STATUS_WORDS, statusOf } from './LobbyPanel';

/**
 * The live grid (SPEC 8.4): one column per world, one row per country.
 *
 * It is a real table, so a screen reader reads "World 2, Borvia" before the cell
 * and the keyboard walks it in the order the eye does. Every state is in words as
 * well as in a dot or a colour, because a teacher glancing across the room needs
 * to read it in a second and because colour alone is never enough (SPEC 9).
 *
 * Each cell carries the one action that belongs to a single country: changing its
 * number. Muting lives with the chat feed, where the message that caused it is.
 */
export interface TeamGridProps {
  view: InstructorView;
  /** Opens the override dialog for one country. */
  onOverride(team: InstructorTeamView): void;
  onMute(team: InstructorTeamView): void;
}

/** "38.3", "38.3 auto", "changed by you", or what is still missing. */
function decisionWords(team: InstructorTeamView, open: boolean): string {
  if (!open) return 'No year open';
  const decision = team.decision;
  if (decision === null) return 'Not submitted';
  const number = `${formatQuantity(decision.tenths)} million barrels`;
  if (decision.source === 'auto') return `${number} (auto)`;
  if (decision.source === 'instructor') return `${number} (changed by you)`;
  return number;
}

/** "14:32:07" on the teacher's own clock, which is the server's clock. */
function timeWords(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function Cell({
  team,
  open,
  onOverride,
  onMute,
}: {
  team: InstructorTeamView;
  open: boolean;
} & Pick<TeamGridProps, 'onOverride' | 'onMute'>) {
  const status = statusOf(team);
  const submitted = open && team.decision !== null;

  return (
    <td className={`grid-cell grid-cell-${status}`}>
      <p className={`grid-status grid-status-${status}`}>
        <span aria-hidden="true">{status === 'connected' ? '●' : '○'}</span> {STATUS_WORDS[status]}
      </p>
      <p className={`grid-decision${submitted ? ' grid-decision-in' : ''}`}>
        {decisionWords(team, open)}
      </p>
      {team.decision !== null && open && (
        <p className="grid-time">{`Sent ${timeWords(team.decision.at)}`}</p>
      )}
      <ul className="grid-marks">
        {team.huddleRecorded && <li>Huddle in</li>}
        {team.predictionRecorded && <li>Prediction in</li>}
        {team.muted && <li className="grid-mark-muted">Muted</li>}
      </ul>
      <div className="grid-actions">
        <Button onClick={() => onOverride(team)} disabled={!open}>
          {`Change ${team.label}`}
        </Button>
        <Button onClick={() => onMute(team)}>
          {team.muted ? `Unmute ${team.label}` : `Mute ${team.label}`}
        </Button>
      </div>
    </td>
  );
}

export function TeamGrid({ view, onOverride, onMute }: TeamGridProps) {
  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';
  const byId = new Map(view.teams.map((team) => [team.teamId, team]));

  return (
    <section className="panel grid-panel" aria-labelledby="grid-heading">
      <h2 id="grid-heading">Every country, right now</h2>
      <p className="hint">
        {open
          ? `${String(view.teams.filter((team) => team.decision !== null).length)} of ${String(view.teams.length)} have submitted.`
          : 'No year is open, so there is nothing to submit.'}
      </p>

      <div className="table-scroll">
        <table className="grid-table">
          <caption className="visually-hidden">
            Each country&rsquo;s computer, decision and notes, by world
          </caption>
          <thead>
            <tr>
              <th scope="col">Country</th>
              {view.worlds.map((world) => (
                <th scope="col" key={world.worldId}>
                  {`World ${String(world.worldNumber)}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COUNTRY_LETTERS.map((letter) => (
              <tr key={letter}>
                <th scope="row">
                  <Badge letter={letter} />
                  <span className="grid-country">{COUNTRY_NAMES[letter]}</span>
                </th>
                {view.worlds.map((world) => {
                  const team = byId.get(`${world.worldId}-${letter}`);
                  if (!team) {
                    return (
                      <td className="grid-cell" key={world.worldId}>
                        <p className="hint">Not in this game</p>
                      </td>
                    );
                  }
                  return (
                    <Cell
                      key={world.worldId}
                      team={team}
                      open={open}
                      onOverride={onOverride}
                      onMute={onMute}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
