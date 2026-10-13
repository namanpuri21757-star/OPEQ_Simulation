import { useState } from 'react';
import { Link } from 'react-router-dom';
import { COUNTRY_LETTERS, COUNTRY_NAMES, NETWORK_CHECK_OK_MS } from '@shared/constants';
import { classPlan } from '@shared/materials';
import type { InstructorTeamView, InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Badge, Button, Confirm, QrCode, type Say } from '../ui';
import { checkLink, joinLink, projectorLink, teamJoinLink } from './links';

/**
 * Everything the teacher does before the lesson starts, as five numbered steps
 * down one page (SPEC 8.4).
 *
 * The order is the order of the jobs: print the cards, open the projector, get
 * the computers on, read the plan, press start. A teacher who has never seen the
 * app can work down it without being told anything, which is the whole point of
 * replacing v1's setup form and lobby list with this.
 *
 * Nothing on this page can be got wrong. The settings are a link in the corner,
 * because a teacher who wants the standard lesson should never have to open a
 * form to get it.
 */
export interface StartScreenProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
  /** Opens the confirmation for the suggested first step. */
  onStart(): void;
}

/**
 * The network check in one line (SPEC 8.6).
 *
 * The question before the bell is not "how many checked in" but "which computer
 * is the one that has not", so the slow and the missing ones are named.
 */
export function checkLine(view: InstructorView): string {
  const records = Object.values(view.networkChecks);
  if (records.length === 0) {
    return `Before you start, ask each group to open ${checkLink()} on its own computer and press Start the check.`;
  }
  const ok = records.filter(
    (record) => record.rttMs <= NETWORK_CHECK_OK_MS && record.transport !== 'unknown',
  ).length;
  const slow = records.length - ok;
  return `Network check: ${String(ok)} of ${String(records.length)} OK${slow === 0 ? '.' : `, ${String(slow)} slow.`}`;
}

function TeamCard({ team }: { team: InstructorTeamView }) {
  const link = teamJoinLink(team.joinCode);
  return (
    <div className="team-card">
      <div>
        <p className="label">{`World ${String(team.worldNumber)}`}</p>
        <p>
          <Badge letter={team.letter} withName />
        </p>
        <span className="team-card-code">{team.joinCode}</span>
        <span className="team-card-where">{link}</span>
      </div>
      <QrCode className="team-card-qr" text={link} label={`Join link for ${team.label}`} />
    </div>
  );
}

export function StartScreen({ view, send, onSaid, onStart }: StartScreenProps) {
  const [releasing, setReleasing] = useState<InstructorTeamView | null>(null);
  const byId = new Map(view.teams.map((team) => [team.teamId, team]));
  const connected = view.teams.filter((team) => team.connected).length;
  const missing = view.teams.length - connected;
  const plan = classPlan(view.settings);

  const act = async (
    type: 'approveTakeover' | 'denyTakeover' | 'releaseTerminal',
    team: InstructorTeamView,
    good: string,
  ) => {
    const ack = await send(type, { teamId: team.teamId });
    onSaid(ack.ok ? `${good} for ${team.label}.` : ack.message, ack.ok ? 'good' : 'bad');
  };

  return (
    <main className="sheet">
      <header className="teacher-band">
        <h1 className="teacher-title">Crude Accord</h1>
        <p className="teacher-facts">
          {`${String(view.worlds.length)} worlds · ${String(view.teams.length)} countries · Session ${view.sessionId}`}
        </p>
      </header>

      <div className="stack">
        <section className="box" aria-labelledby="step-1">
          <div className="box-head">
            <h2 className="step-title" id="step-1">
              <span className="step-no">Step 1</span> Print team cards
            </h2>
            <Link className="btn btn-primary" to="/instructor/cards" target="_blank" rel="noreferrer">
              <span>Print cards</span>
              <span aria-hidden="true">&#9656;</span>
            </Link>
          </div>
          <p className="note">
            One card per table. Four to a page, black on white, with cut lines.
          </p>
          <div className="card-sheet">
            {view.worlds.map((world) =>
              COUNTRY_LETTERS.map((letter) => {
                const team = byId.get(`${world.worldId}-${letter}`);
                return team ? <TeamCard key={team.teamId} team={team} /> : null;
              }),
            )}
          </div>
        </section>

        <section className="box" aria-labelledby="step-2">
          <div className="box-head">
            <h2 className="step-title" id="step-2">
              <span className="step-no">Step 2</span> Open the projector
            </h2>
            <Button
              onClick={() => {
                window.open(projectorLink(view), 'crude-accord-projector', 'noopener');
              }}
            >
              Open projector
            </Button>
          </div>
          <p className="num" style={{ fontSize: 'var(--t-section)', wordBreak: 'break-all' }}>
            {projectorLink(view)}
          </p>
          <p className="note">Put it on the second screen. It can only ever watch.</p>
        </section>

        <section className="box" aria-labelledby="step-3">
          <div className="box-head">
            <h2 className="step-title" id="step-3">
              <span className="step-no">Step 3</span> Connect the team computers
            </h2>
            <p className="num">{`${String(connected)} of ${String(view.teams.length)} connected`}</p>
          </div>
          <p className="note">{`Every group opens ${joinLink()} and types the code from its card.`}</p>
          <p className="note">{checkLine(view)}</p>

          <div className="connect-grid">
            {view.worlds.map((world) =>
              COUNTRY_LETTERS.map((letter) => {
                const team = byId.get(`${world.worldId}-${letter}`);
                if (!team) return null;
                const on = team.connected;
                return (
                  <div key={team.teamId}>
                    <p className="label label-muted">{`World ${String(world.worldNumber)} · ${COUNTRY_NAMES[letter]}`}</p>
                    <p className="cell-line">
                      <span
                        className={`dot ${on ? 'dot-on' : 'dot-wait'}`}
                        aria-hidden="true"
                      >
                        &#9679;
                      </span>
                      {on ? 'Connected' : 'Waiting'}
                    </p>
                    {team.pendingTakeover && (
                      <div className="cell-actions">
                        <Button onClick={() => void act('approveTakeover', team, 'Terminal moved')}>
                          {`Move ${team.label} here`}
                        </Button>
                        <Button onClick={() => void act('denyTakeover', team, 'Request refused')}>
                          Refuse
                        </Button>
                      </div>
                    )}
                    {team.claimed && !team.pendingTakeover && (
                      <div className="cell-actions">
                        <Button onClick={() => setReleasing(team)}>Release</Button>
                      </div>
                    )}
                  </div>
                );
              }),
            )}
          </div>
        </section>

        <section className="box" aria-labelledby="step-4">
          <div className="box-head">
            <h2 className="step-title" id="step-4">
              <span className="step-no">Step 4</span> How the class runs
            </h2>
            <Link className="btn" to="/instructor/settings">
              Set worlds and rounds
            </Link>
          </div>
          <p className="note">
            {`${String(view.worlds.length)} worlds, ${String(view.settings.years)} rounds${view.settings.autoAdvance ? ', moving on by itself when everyone has submitted' : ''}.`}
          </p>
          <ol className="plan">
            {plan.map((row) => (
              <li key={row.stage}>
                <span>{row.stage}</span>
                <span className="plan-minutes">{`${String(row.minutes)} min`}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="box" aria-labelledby="step-5">
          <h2 className="step-title" id="step-5">
            <span className="step-no">Step 5</span> Start
          </h2>
          <p className="btn-row" role="group" aria-label="The next step" style={{ marginTop: 'var(--s4)' }}>
            <Button tone="primary" size="large" onClick={onStart}>
              {view.suggested.label}
            </Button>
          </p>
          <p className="note" style={{ marginTop: 'var(--s4)' }}>
            {missing === 0
              ? 'Every computer is connected.'
              : `${String(missing)} not connected yet. They can join late.`}
          </p>
        </section>
      </div>

      <p className="teacher-corner">
        <Link to="/instructor/settings">Lesson settings</Link>
        <Link to="/instructor/materials" target="_blank" rel="noreferrer">
          Materials
        </Link>
      </p>

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
    </main>
  );
}
