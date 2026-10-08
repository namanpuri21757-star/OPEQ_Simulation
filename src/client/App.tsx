import type { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { ConnectionProvider } from './net';
import CheckPage from './check/CheckPage';
import CardsPage from './instructor/CardsPage';
import InstructorPage from './instructor/InstructorPage';
import MaterialsPage from './instructor/MaterialsPage';
import SettingsPage from './instructor/SettingsPage';
import SummaryPage from './instructor/SummaryPage';
import Join from './pages/Join';
import Landing from './pages/Landing';
import ProjectorPage from './projector/ProjectorPage';
import TeamTerminal from './team/TeamTerminal';

/** Every route in SPEC section 8, so a link or a reload always lands somewhere
 * sensible. The debrief itself lives on the dashboard; the two pages beside it
 * here are the printable ones. */
function NotFound() {
  return (
    <main className="sheet">
      <header className="teacher-band">
        <h1 className="teacher-title">{APP_NAME}</h1>
      </header>
      <section className="box">
        <p className="lede">{APP_TAGLINE}</p>
        <p className="note">That page does not exist. Try the address your teacher gave you.</p>
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
      <Route path="/instructor/settings" element={<SettingsPage />} />
      <Route path="/instructor/summary" element={<SummaryPage />} />
      <Route path="/instructor/materials" element={<MaterialsPage />} />
      <Route path="/projector/:id" element={<ProjectorPage />} />
      <Route path="/check" element={<CheckPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
