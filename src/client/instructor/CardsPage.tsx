import { useMemo } from 'react';
import { APP_NAME } from '@shared/constants';
import type { InstructorView } from '@shared/views';
import { RoleConnection, browserStore, readInstructor, useView, type KeyValueStore } from '../net';
import { Badge, Button, QrCode } from '../ui';
import { teamJoinLink } from './links';

/**
 * The cards you hand out (SPEC 8.4, /instructor/cards).
 *
 * One card per team, four to a page, each with everything a group needs and
 * nothing else: which country it is, which world, its code, the link and a QR
 * code for the link. No instructor key, no other team's code.
 *
 * The badge is a shape and a letter as well as a colour, so the cards still work
 * printed in black and white (SPEC section 9).
 */
export interface CardsPageProps {
  store?: KeyValueStore;
}

export default function CardsPage({ store }: CardsPageProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  const saved = useMemo(() => readInstructor(keyValue), [keyValue]);

  if (saved === null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">
          Open your dashboard first, then come back here. The cards are built from the game running
          on this computer.
        </p>
      </main>
    );
  }

  return (
    <RoleConnection sessionId={saved.sessionId} role="instructor" authKey={saved.instructorKey}>
      <Cards />
    </RoleConnection>
  );
}

/** Only the route reads the context; the cards themselves take a view. */
function Cards() {
  const { view } = useView<InstructorView>();

  if (view === null || view.kind !== 'instructor') {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">Getting the codes...</p>
      </main>
    );
  }

  return <TeamCards view={view} />;
}

export function TeamCards({ view }: { view: InstructorView }) {
  const teams = [...view.teams].sort(
    (x, y) => x.worldNumber - y.worldNumber || x.letter.localeCompare(y.letter),
  );

  return (
    <main className="cards-page">
      <div className="cards-toolbar">
        <h1>Team cards</h1>
        <p className="note">
          {`${String(teams.length)} cards, four to a page. Cut them up and put one on each table.`}
        </p>
        <Button tone="primary" onClick={() => window.print()}>
          Print these cards
        </Button>
      </div>

      <ol className="cards">
        {teams.map((team) => {
          const link = teamJoinLink(team.joinCode);
          return (
            <li className="card" key={team.teamId}>
              <div className="card-who">
                <Badge letter={team.letter} size="large" />
                <div>
                  <p className="card-country">{team.countryName}</p>
                  <p className="card-world">{`World ${String(team.worldNumber)} - country ${team.letter}`}</p>
                </div>
              </div>

              <p className="card-code">
                <span className="card-code-label">Your code</span>
                <span className="card-code-value">{team.joinCode}</span>
              </p>

              <div className="card-join">
                <div>
                  <p className="card-link-label">Open this on your computer</p>
                  <p className="card-link">{link}</p>
                  <p className="card-hint">Or go to the address on the board and type your code.</p>
                </div>
                <QrCode text={link} label={`Join link for ${team.label}`} className="qr-card" />
              </div>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
