import type { CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { formatPrice, formatQuantity } from '@shared/units';
import type { ProjectorView } from '@shared/views';
import { RoleConnection, useView } from '../net';
import { Countdown, DataTable, QrCode, StartsIn } from '../ui';
import { DebriefScreenView, debriefTitleOf, isDebriefScreenName } from '../debrief';
import { joinLink } from '../instructor/links';

/**
 * The projector (SPEC 8.5): the same design system at the size a room reads.
 *
 * It is built from the projector view, which is the only thing the server will
 * send this key, so there is nothing private here to leave out by hand. The
 * read-only key also means a student who photographs the screen and types the
 * address in gets a screen that cannot change anything.
 *
 * A status strip, one big clock, and between years each world's price and its
 * results table. No news and no announcements: both are gone, and the room now
 * hears from the teacher out loud, which is where it belonged.
 */
const PHASE_WORDS: Record<ProjectorView['phase'], string> = {
  LOBBY: 'Welcome',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Practice year',
  PRACTICE_REVEAL: 'Practice results',
  YEAR_OPEN: 'Decide now',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Summit',
  ENDED: 'Finished',
};

export default function ProjectorPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const key = params.get('k');

  if (id === undefined || key === null) {
    return (
      <main className="projector">
        <h1 className="projector-title">{APP_NAME}</h1>
        <p className="projector-lead">
          This screen needs the projector link from the instructor&rsquo;s dashboard.
        </p>
      </main>
    );
  }

  return (
    <RoleConnection sessionId={id} role="projector" authKey={key}>
      <Projector />
    </RoleConnection>
  );
}

/** Only the route reads the context; the screen itself takes a view. */
function Projector() {
  const { view, status, serverNow, problem } = useView<ProjectorView>();

  if (problem !== null || status === 'refused') {
    return (
      <main className="projector">
        <h1 className="projector-title">{APP_NAME}</h1>
        <p className="projector-lead">{problem ?? 'That projector link is not right.'}</p>
      </main>
    );
  }

  if (view === null || view.kind !== 'projector') {
    return (
      <main className="projector">
        <h1 className="projector-title">{APP_NAME}</h1>
        <p className="projector-lead">Connecting...</p>
      </main>
    );
  }

  return <ProjectorScreen view={view} serverNow={serverNow} />;
}

export interface ProjectorScreenProps {
  view: ProjectorView;
  serverNow(): number;
}

export function ProjectorScreen({ view, serverNow }: ProjectorScreenProps) {
  // The debrief: exactly the screen the instructor sent, in large type
  // (SPEC 8.5). The data only reaches this key once the game has ended, so
  // there is nothing here to leak during play.
  if (view.debrief !== null && isDebriefScreenName(view.screen)) {
    return (
      <main className="projector">
        <DebriefScreenView
          screen={view.screen}
          debrief={view.debrief}
          worldNumber={view.worldNumber}
        />
      </main>
    );
  }

  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const atReveal = view.phase === 'PRACTICE_REVEAL' || view.phase === 'YEAR_REVEAL';
  const showTables = atReveal && view.showsPrices;

  return (
    <main className="projector">
      <header className="strip projector-strip" role="group" aria-label="Where the game is">
        <span className="strip-item">
          <span className="strip-value">{PHASE_WORDS[view.phase].toUpperCase()}</span>
        </span>
        {view.phase !== 'LOBBY' && view.phase !== 'BRIEFING' && (
          <span className="strip-item">
            <span className="strip-key">Year</span>
            <span className="strip-value projector-year">
              {view.year === 0 ? 'PRACTICE' : view.year}
            </span>
          </span>
        )}
        {view.finalYearAnnounced && (
          <span className="strip-item">
            <span className="strip-value">FINAL YEAR</span>
          </span>
        )}
        {view.phase !== 'LOBBY' && (
          <span className="strip-item strip-spacer">
            <span className="strip-key">Messaging</span>
            <span className={`strip-value ${view.messaging.on ? 'switch-on' : ''}`}>
              {view.messaging.on ? 'ON' : 'OFF'}
              {view.messaging.on && view.messaging.until !== null && (
                <>
                  {' – '}
                  <Countdown
                    deadline={view.messaging.until}
                    remainingMs={null}
                    paused={false}
                    serverNow={serverNow}
                    closedLabel="0:00"
                  />
                </>
              )}
            </span>
          </span>
        )}
      </header>

      {timed && (
        <div className="projector-clock">
          <Countdown
            deadline={view.timing.deadline}
            remainingMs={view.timing.remainingMs}
            paused={view.timing.paused}
            serverNow={serverNow}
            closedLabel="Time is up"
          />
        </div>
      )}

      {view.phase === 'LOBBY' && <Lobby view={view} />}

      {view.between !== null && (
        <p className="projector-lead">Envoys: go to the meeting point.</p>
      )}

      {view.faceToFace && (
        <p className="projector-lead">Face to face this round: Envoys may meet the other countries.</p>
      )}

      {atReveal && (
        <StartsIn
          at={view.advanceAt}
          what={`Year ${String(view.year + 1)}`}
          serverNow={serverNow}
          className="projector-lead"
        />
      )}

      {showTables && (
        <section
          className="projector-worlds"
          aria-labelledby="worlds-heading"
          style={{ '--worlds': view.worlds.length } as CSSProperties}
        >
          <h2 className="visually-hidden" id="worlds-heading">
            Each world this year
          </h2>
          {view.worlds.map((world) => (
            <div className="projector-world" key={world.worldNumber}>
              <p className="obs-period">{`World ${String(world.worldNumber)}`}</p>
              <p>
                <strong className="projector-price">
                  {world.priceCents === null ? '-' : formatPrice(world.priceCents)}
                </strong>
              </p>
              {world.priceChangeCents !== null && world.priceChangeCents !== 0 && (
                <p
                  className={`obs-change ${world.priceChangeCents > 0 ? 'obs-up' : 'obs-down'}`}
                >
                  <span aria-hidden="true">{world.priceChangeCents > 0 ? '▲' : '▼'}</span>{' '}
                  {formatPrice(Math.abs(world.priceChangeCents))}
                </p>
              )}
              {world.rows.length > 0 && (
                <DataTable
                  caption={`World ${String(world.worldNumber)} by year`}
                  columns={['Year', 'Total', 'Price']}
                  rows={world.rows.map((row) => [
                    row.isPractice ? 'PR' : String(row.year),
                    formatQuantity(row.totalTenths),
                    formatPrice(row.priceCents),
                  ])}
                  isPractice={(index) => world.rows[index]?.isPractice === true}
                  hideCaption
                />
              )}
            </div>
          ))}
          <p className="chart-source">
            Price in $ per barrel. Total in million barrels. PR is the practice year, which is never
            scored.
          </p>
        </section>
      )}

      {/* A debrief screen was sent before the game ended, so there is nothing
          to show yet: say so rather than going blank mid-lesson. */}
      {debriefTitleOf(view.screen) !== undefined && (
        <p className="projector-lead">Your teacher is about to show something here.</p>
      )}
    </main>
  );
}

/** The lobby: how to join, and which table each country sits at. */
function Lobby({ view }: { view: ProjectorView }) {
  const url = joinLink();
  const worlds = [...new Set(view.tables.map((row) => row.worldNumber))].sort((x, y) => x - y);

  return (
    <>
      <p className="projector-lead">{APP_TAGLINE}</p>

      <section className="projector-join" aria-labelledby="join-heading">
        <h2 id="join-heading" className="projector-h2">
          Open this on your team computer
        </h2>
        <p className="projector-url">{url}</p>
        <QrCode text={url} label={`QR code for ${url}`} className="qr-projector" />
        <p className="projector-note">Then type the six-character code on your card.</p>
      </section>

      <section className="projector-tables" aria-labelledby="tables-heading">
        <h2 id="tables-heading" className="projector-h2">
          Find your table
        </h2>
        <div className="projector-table-grid">
          {worlds.map((worldNumber) => (
            <div className="projector-world" key={worldNumber}>
              <h3>{`World ${String(worldNumber)}`}</h3>
              <ul>
                {view.tables
                  .filter((row) => row.worldNumber === worldNumber)
                  .map((row) => (
                    <li key={row.letter}>
                      <span className="table-country">{`${row.countryName} (${row.letter})`}</span>
                      <span className="table-state">{row.claimed ? 'ready' : 'waiting'}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
