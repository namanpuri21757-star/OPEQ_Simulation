import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { APP_NAME, APP_TAGLINE } from '@shared/constants';
import { browserStore, readTerminal } from '../net';

/**
 * The landing page (SPEC 8.1): two large buttons and nothing else to read.
 *
 * A computer that has already claimed a country goes straight back to its team
 * screen, because that is what a student who reloaded by accident needs.
 */
export default function Landing() {
  const saved = useMemo(() => readTerminal(browserStore()), []);
  if (saved !== null) return <Navigate to="/team" replace />;

  return (
    <main className="page page-landing">
      <h1>{APP_NAME}</h1>
      <p className="tagline">{APP_TAGLINE}</p>

      <div className="landing-choices">
        <Link className="button button-primary button-large" to="/join">
          This is a team computer
        </Link>
        <Link className="button button-large" to="/instructor">
          I am the instructor
        </Link>
      </div>

      <p className="hint">
        Teams: your teacher will give you a card with a six-character code. Everything else happens
        on this computer.
      </p>
    </main>
  );
}
