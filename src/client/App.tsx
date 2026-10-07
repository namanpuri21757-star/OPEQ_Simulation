import type { ReactNode } from 'react';
import { Route, Routes, useParams } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { ConnectionProvider } from './net';
import Join from './pages/Join';
import Landing from './pages/Landing';
import TeamTerminal from './team/TeamTerminal';

/**
 * Every route in SPEC section 8 exists so a link or a reload always lands
 * somewhere sensible. The instructor, projector and check screens arrive in
 * later phases and are placeholders for now.
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

function ProjectorPlaceholder() {
  const { id } = useParams<{ id: string }>();
  return <Placeholder title={`Projector for session ${id ?? 'unknown'}`} />;
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
      <Route path="/instructor" element={<Placeholder title="Instructor Dashboard" />} />
      <Route path="/projector/:id" element={<ProjectorPlaceholder />} />
      <Route path="/check" element={<Placeholder title="Network check" />} />
      <Route path="*" element={<Placeholder title="Page not found" />} />
    </Routes>
  );
}
