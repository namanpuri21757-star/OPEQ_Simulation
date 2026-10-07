import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { ConnectionProvider } from './net';
import CheckPage from './check/CheckPage';
import CardsPage from './instructor/CardsPage';
import InstructorPage from './instructor/InstructorPage';
import Join from './pages/Join';
import Landing from './pages/Landing';
import ProjectorPage from './projector/ProjectorPage';
import TeamTerminal from './team/TeamTerminal';

/**
 * Every route in SPEC section 8, so a link or a reload always lands somewhere
 * sensible. The debrief screens hang off /instructor and arrive with the
 * debrief itself.
 */
function Placeholder({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{APP_NAME}</h1>
      <p className="tagline">{APP_TAGLINE}</p>
      <section className="panel">
        <h2>{title}</h2>
        <p>Setup in progress</p>
      </section>
    </main>
  );
}

/** The screens that talk to the server as a team terminal share one connection. */
function Terminal({ children }: { children: ReactNode }) {
  return <ConnectionProvider>{children}</ConnectionProvider>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/join"
        element={
          <Terminal>
            <Join />
          </Terminal>
        }
      />
      <Route
        path="/join/:code"
        element={
          <Terminal>
            <Join />
          </Terminal>
        }
      />
      <Route
        path="/team"
        element={
          <Terminal>
            <TeamTerminal />
          </Terminal>
        }
      />
      <Route path="/instructor" element={<InstructorPage />} />
      <Route path="/instructor/cards" element={<CardsPage />} />
      <Route path="/projector/:id" element={<ProjectorPage />} />
      <Route path="/check" element={<CheckPage />} />
      <Route path="*" element={<Placeholder title="Page not found" />} />
    </Routes>
  );
}
