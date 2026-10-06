import { Route, Routes, useParams } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';

/**
 * Phase 1 placeholder. Every route in SPEC 8 exists so links and reloads work;
 * the real screens arrive in later phases.
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

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder title="Welcome" />} />
      <Route path="/join" element={<Placeholder title="Join a team" />} />
      <Route path="/join/:code" element={<Placeholder title="Join a team" />} />
      <Route path="/team" element={<Placeholder title="Team Terminal" />} />
      <Route path="/instructor" element={<Placeholder title="Instructor Dashboard" />} />
      <Route path="/projector/:id" element={<ProjectorPlaceholder />} />
      <Route path="/check" element={<Placeholder title="Network check" />} />
      <Route path="*" element={<Placeholder title="Page not found" />} />
    </Routes>
  );
}
