import { Link } from 'react-router-dom';
import type { InstructorTeamView, InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Badge, Button, Confirm, QrCode, type Say } from '../ui';
import { joinLink } from './links';
import { useState } from 'react';

/**
 * The lobby (SPEC 8.4): the link on the wall, and a row per team.
 *
 * The session URL and the QR code are large because the room reads them from
 * their seats, and the QR code is drawn on this computer with no internet
 * involved (SPEC section 9).
 *
 * Teams are grouped by world so the roster reads the same way the room is laid
 * out, and each row says in words whether a terminal is connected, so the dot is
 * never the only sign (SPEC section 9).
 */
export type TeamStatus = 'unclaimed' | 'connected' | 'offline';

export function statusOf(team: InstructorTeamView): TeamStatus {
  if (!team.claimed) return 'unclaimed';
  return team.connected ? 'connected' : 'offline';
}

export const STATUS_WORDS: Record<TeamStatus, string> = {
  unclaimed: 'No computer yet',
  connected: 'Connected',
  offline: 'Offline',
};

export interface LobbyPanelProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
}

export function LobbyPanel({ view, send, onSaid }: LobbyPanelProps) {
  const [releasing, setReleasing] = useState<InstructorTeamView | null>(null);
  const url = joinLink();

  const act = async (
    type: 'approveTakeover' | 'denyTakeover' | 'releaseTerminal',
    team: InstructorTeamView,
    good: string,
  ) => {
    const ack = await send(type, { teamId: team.teamId });
    onSaid(ack.ok ? `${good} for ${team.label}.` : ack.message, ack.ok ? 'good' : 'bad');
  };

  const worlds = view.worlds.map((world) => ({
    world,
    teams: view.teams
      .filter((team) => team.worldId === world.worldId)
      .sort((x, y) => x.letter.localeCompare(y.letter)),
  }));

  return (
    <section className="panel lobby-panel" aria-labelledby="lobby-heading">
      <h2 id="lobby-heading">Get the room joined</h2>

      <div className="join-invite">
        <div>
          <p className="join-invite-lead">Everyone opens this address:</p>
          <p className="join-url">{url}</p>
          <p className="hint">
            Teams then type the six-character code on their card. Or they can scan this and type
            only the code.
          </p>
        </div>
        <QrCode text={url} label={`QR code for ${url}`} className="qr-large" />
      </div>

      <div className="row">
        <Link className="button" to="/instructor/cards" target="_blank" rel="noreferrer">
          Print team cards
        </Link>
      </div>

      {worlds.map(({ world, teams }) => (
        <div className="lobby-world" key={world.worldId}>
          <h3>{`World ${String(world.worldNumber)}`}</h3>
          <ul className="team-rows">
            {teams.map((team) => {
              const status = statusOf(team);
              return (
                <li className={`team-row team-row-${status}`} key={team.teamId}>
                  <span className="team-row-who">
                    <Badge letter={team.letter} withName />
                  </span>
                  <span className="team-row-code">
                    <span className="visually-hidden">Join code</span>
                    {team.joinCode}
                  </span>
                  <span className="team-row-status">
                    <span aria-hidden="true">{status === 'connected' ? '●' : '○'}</span>{' '}
                    {STATUS_WORDS[status]}
                  </span>
                  <span className="team-row-members">
                    {team.members.length === 0 ? (
                      <span className="hint">No names yet</span>
                    ) : (
                      team.members.join(', ')
                    )}
                  </span>
                  <span className="team-row-actions">
                    {team.pendingTakeover && (
                      <>
                        <Button
                          tone="primary"
                          onClick={() => void act('approveTakeover', team, 'Terminal moved')}
                        >
                          {`Approve new computer for ${team.label}`}
                        </Button>
                        <Button
                          onClick={() => void act('denyTakeover', team, 'Request turned down')}
                        >
                          {`Deny for ${team.label}`}
                        </Button>
                      </>
                    )}
                    {team.claimed && (
                      <Button onClick={() => setReleasing(team)}>{`Release ${team.label}`}</Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {releasing !== null && (
        <Confirm
          title={`Release ${releasing.label}?`}
          confirmLabel="Yes, release it"
          onCancel={() => setReleasing(null)}
          onConfirm={() => {
            const team = releasing;
            setReleasing(null);
            void act('releaseTerminal', team, 'Terminal released');
          }}
        >
          <p>
            {`That computer goes back to the join screen and ${releasing.label} can be claimed again with the code ${releasing.joinCode}. Decisions already made are kept.`}
          </p>
        </Confirm>
      )}
    </section>
  );
}
