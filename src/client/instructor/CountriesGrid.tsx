import { COUNTRY_LETTERS, COUNTRY_NAMES } from '@shared/constants';
import { formatQuantity } from '@shared/units';
import type { InstructorTeamView, InstructorView } from '@shared/views';
import { Badge, Button } from '../ui';

/**
 * The live grid (SPEC 8.4): one column per world, one row per country.
 *
 * Each cell holds everything about that one country: whether its computer is
 * there, what it has sent, and whether it was filled in. A problem shows inside
 * the cell it belongs to - v1 collected problems into a separate "things to look
 * at" list, which meant reading a sentence, finding the country it named and
 * then looking at the grid anyway.
 *
 * It is a real table, so a screen reader reads "World 2, Borvia" before the cell
 * and the keyboard walks it in the order the eye does. Every state is in words
 * as well as in a dot, because colour alone is never enough (SPEC section 9).
 */
export interface CountriesGridProps {
  view: InstructorView;
  /** Opens the override dialog for one country. */
  onOverride(team: InstructorTeamView): void;
  onMute(team: InstructorTeamView): void;
}

function Cell({
  team,
  open,
  onOverride,
  onMute,
}: { team: InstructorTeamView; open: boolean } & Pick<
  CountriesGridProps,
  'onOverride' | 'onMute'
>) {
  const decision = team.decision;
  const offline = team.claimed && !team.connected;

  return (
    <td>
      <p className="cell-line">
        {team.claimed ? (
          <>
            <span
              className={`dot ${team.connected ? 'dot-on' : 'dot-off'}`}
              aria-hidden="true"
            >
              &#9679;
            </span>
            {decision === null ? (
              <span>&ndash;</span>
            ) : (
              <>
                <span aria-hidden="true">&#10003;</span>
                <span>{formatQuantity(decision.tenths)}</span>
                {decision.source === 'auto' && <span className="auto-mark">auto</span>}
                {decision.source === 'instructor' && <span className="auto-mark">by you</span>}
              </>
            )}
          </>
        ) : (
          <>
            <span className="dot dot-wait" aria-hidden="true">
              &#9679;
            </span>
            <span className="cell-problem">No computer</span>
          </>
        )}
      </p>

      {offline && <p className="cell-problem">Offline</p>}
      {team.muted && <p className="cell-problem">Muted</p>}
      {team.pendingTakeover && <p className="cell-problem">Wants to move computer</p>}

      <div className="cell-actions">
        {open && (
          <Button onClick={() => onOverride(team)}>
            <span aria-hidden="true">Change</span>
            <span className="visually-hidden">{`Change ${team.label}`}</span>
          </Button>
        )}
        <Button onClick={() => onMute(team)}>
          <span aria-hidden="true">{team.muted ? 'Unmute' : 'Mute'}</span>
          <span className="visually-hidden">
            {team.muted ? `Unmute ${team.label}` : `Mute ${team.label}`}
          </span>
        </Button>
      </div>
    </td>
  );
}

/** The one line under the status strip when something needs doing. */
export function problemLine(view: InstructorView): string | null {
  const offline = view.teams.filter((team) => team.claimed && !team.connected);
  const waiting = view.teams.filter((team) => team.pendingTakeover);
  if (waiting.length > 0) {
    return `${waiting.map((team) => team.label).join(', ')}: a different computer is asking to take over. Approve it on the start screen or release the country.`;
  }
  if (offline.length > 0) {
    return `${offline.map((team) => team.label).join(', ')} went offline. Their decisions are safe; they will catch up when they reconnect.`;
  }
  return null;
}

export function CountriesGrid({ view, onOverride, onMute }: CountriesGridProps) {
  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';
  const byId = new Map(view.teams.map((team) => [team.teamId, team]));

  return (
    <section className="box" aria-labelledby="countries-heading">
      <div className="box-head">
        <h2 id="countries-heading">Countries</h2>
        <span className="label label-muted">
          {open ? 'Check for a dash or a red dot' : 'No year is open'}
        </span>
      </div>

      <div
        className="table-scroll"
        tabIndex={0}
        role="group"
        aria-label="Every country, world by world"
      >
        <table className="countries">
          <caption className="visually-hidden">
            Each country&rsquo;s computer and decision, by world
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
                  <span className="cell-line" style={{ fontFamily: 'var(--sans)' }}>
                    <Badge letter={letter} size="small" />
                    {COUNTRY_NAMES[letter]}
                  </span>
                </th>
                {view.worlds.map((world) => {
                  const team = byId.get(`${world.worldId}-${letter}`);
                  return team ? (
                    <Cell
                      key={world.worldId}
                      team={team}
                      open={open}
                      onOverride={onOverride}
                      onMute={onMute}
                    />
                  ) : (
                    <td key={world.worldId}>
                      <p className="note">Not in this game</p>
                    </td>
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
