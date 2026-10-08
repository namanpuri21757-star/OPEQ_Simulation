import { Navigate, useNavigate } from 'react-router-dom';
import { APP_NAME } from '@shared/constants';
import type { TeamView } from '@shared/views';
import { statusMessage, useView } from '../net';
import { Banner, Toast, useToast } from '../ui';
import { BetweenScreen } from './BetweenScreen';
import { BriefingScreen } from './BriefingScreen';
import { EndedScreen } from './EndedScreen';
import { LobbyScreen } from './LobbyScreen';
import { RevealScreen } from './RevealScreen';
import { TakeoverScreen } from './TakeoverScreen';
import { TerminalHeader } from './TerminalHeader';
import { YearScreen } from './YearScreen';

/**
 * The team terminal (SPEC 8.3): one screen per phase, with the same header on
 * all of them.
 *
 * Which screen to show is read off the view, never decided here, so a terminal
 * that was asleep or offline catches up the moment its next view arrives
 * (CLAUDE.md rule 1).
 */
export default function TeamTerminal() {
  const { view, status, gone, needsClaim, problem, send, serverNow, connection } =
    useView<TeamView>();
  const { message, say } = useToast();
  const navigate = useNavigate();

  if (gone !== null) {
    return (
      <TakeoverScreen
        gone={gone}
        onJoinAgain={() => {
          connection.forget();
          void navigate('/join');
        }}
      />
    );
  }

  if (problem !== null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <Banner tone="alert">{problem}</Banner>
      </main>
    );
  }

  // A terminal with no claim gets the lobby view, which is almost empty.
  if (needsClaim || view === null || view.kind !== 'team') {
    if (needsClaim) return <Navigate to="/join" replace />;
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">Getting your country ready...</p>
      </main>
    );
  }

  const offline = statusMessage(status);

  return (
    <main className="sheet page-team">
      <TerminalHeader view={view} status={status} serverNow={serverNow} />

      {offline !== null && (
        <Banner tone="warning" title="Offline">
          {offline}
        </Banner>
      )}

      {view.phase === 'LOBBY' && <LobbyScreen view={view} />}
      {view.phase === 'BRIEFING' && <BriefingScreen view={view} />}
      {(view.phase === 'PRACTICE_OPEN' || view.phase === 'YEAR_OPEN') && (
        <YearScreen view={view} send={send} onSaid={say} serverNow={serverNow} />
      )}
      {(view.phase === 'PRACTICE_REVEAL' || view.phase === 'YEAR_REVEAL') && (
        <RevealScreen view={view} send={send} onSaid={say} serverNow={serverNow} />
      )}
      {view.phase === 'BETWEEN' && (
        <BetweenScreen view={view} send={send} serverNow={serverNow} onSaid={say} />
      )}
      {view.phase === 'ENDED' && <EndedScreen view={view} send={send} onSaid={say} />}

      <Toast message={message} />
    </main>
  );
}
