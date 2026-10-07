import { useParams, useSearchParams } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { formatPrice } from '@shared/units';
import type { ProjectorView } from '@shared/views';
import { RoleConnection, useView } from '../net';
import { Countdown, QrCode } from '../ui';
import { DebriefScreenView, debriefTitleOf, isDebriefScreenName } from '../debrief';
import { joinLink } from '../instructor/links';

/**
 * The projector (SPEC 8.5): very large type, public information only.
 *
 * It is built from the projector view, which is the only thing the server will
 * send this key, so there is nothing private here to leave out by hand. The
 * read-only key also means a student who photographs the screen and types the
 * address in gets a screen that cannot change anything.
 *
 * Three things it shows, in order of what the room needs: in the lobby, how to
 * join and where to sit; during play, the year, the phase and the clock; after a
 * reveal, each world's price when the instructor has allowed it.
 */
const PHASE_WORDS: Record<ProjectorView['phase'], string> = {
  LOBBY: 'Welcome',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Practice year - decide now',
  PRACTICE_REVEAL: 'Practice results',
  YEAR_OPEN: 'Decide now',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Talking time',
  ENDED: 'Game over',
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
  const latest = view.announcements[view.announcements.length - 1] ?? null;
  const atReveal = view.phase === 'PRACTICE_REVEAL' || view.phase === 'YEAR_REVEAL';
  const prices = view.worlds.filter((world) => world.priceCents !== null);

  return (
    <main className="projector">
      <header className="projector-head">
        <p className="projector-phase">{PHASE_WORDS[view.phase]}</p>
        {view.phase !== 'LOBBY' && view.phase !== 'BRIEFING' && (
          <p className="projector-year">{view.year === 0 ? 'PRACTICE' : view.yearLabel}</p>
        )}
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
      </header>

      {view.phase === 'LOBBY' && <Lobby view={view} />}

      {view.between !== null && (
        <p className="projector-lead">
          {view.between.kind === 'summit'
            ? 'Envoys: go to the meeting point.'
            : 'Chat window is open. Talk to the other countries in your world.'}
        </p>
      )}

      {atReveal && view.showsPrices && prices.length > 0 && (
        <section className="projector-prices" aria-labelledby="prices-heading">
          <h2 id="prices-heading" className="projector-h2">
            This year&rsquo;s price
          </h2>
          <ul className="price-list">
            {prices.map((world) => (
              <li key={world.worldNumber}>
                <span className="price-world">{`World ${String(world.worldNumber)}`}</span>
                <span className="price-value">{formatPrice(world.priceCents ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {latest !== null && (
        <section className="projector-announcement" aria-live="polite">
          <h2 className="projector-h2">From your teacher</h2>
          <p>{latest.text}</p>
        </section>
      )}

      {view.news.length > 0 && (
        <section className="projector-news" aria-labelledby="news-heading">
          <h2 id="news-heading" className="projector-h2">
            News
          </h2>
          <ul>
            {view.news.slice(-3).map((item) => (
              <li key={item.newsId}>{item.text}</li>
            ))}
          </ul>
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
      </section>
    </>
  );
}
