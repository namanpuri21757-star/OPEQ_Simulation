import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { APP_NAME, DEFAULT_WORLDS } from '@shared/constants';
import type { CreateSessionResult } from '@shared/protocol';
import type { InstructorView } from '@shared/views';
import {
  RoleConnection,
  browserStore,
  clearInstructor,
  readInstructor,
  statusMessage,
  useView,
  writeInstructor,
  type KeyValueStore,
  type SavedInstructor,
} from '../net';
import { Banner, Button } from '../ui';
import { Dashboard } from './Dashboard';

/**
 * The instructor's way in (SPEC 8.4): resume the saved game, or start one.
 *
 * Three things can bring a teacher here and all three have to land somewhere
 * sensible: the link with the key in it (a fresh tab, or a second laptop), this
 * computer's own memory of the session (a reload), and nothing at all (the first
 * time, before any session exists).
 *
 * The key is kept in localStorage on this computer only. It is never put in a
 * view that anyone else receives, and the projector gets its own separate key.
 */
export interface InstructorPageProps {
  /** Test seam: a store a test can read back. */
  store?: KeyValueStore;
}

export default function InstructorPage({ store }: InstructorPageProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  const [params] = useSearchParams();
  const fromLink = params.get('s');
  const keyFromLink = params.get('k');

  // The link wins over what is saved, so a teacher who pastes a link onto a
  // second laptop gets that session rather than whatever this one last ran.
  const [session, setSession] = useState<SavedInstructor | null>(() => {
    if (fromLink !== null && keyFromLink !== null) {
      const fresh = { sessionId: fromLink, instructorKey: keyFromLink };
      writeInstructor(keyValue, fresh);
      return fresh;
    }
    return readInstructor(keyValue);
  });

  const forget = () => {
    clearInstructor(keyValue);
    setSession(null);
  };

  if (session === null) {
    return (
      <RoleConnection sessionId="" role="setup">
        <CreateSession
          onCreated={(result) => {
            const fresh = {
              sessionId: result.sessionId,
              instructorKey: result.instructorKey,
            };
            writeInstructor(keyValue, fresh);
            setSession(fresh);
          }}
        />
      </RoleConnection>
    );
  }

  return (
    <RoleConnection sessionId={session.sessionId} role="instructor" authKey={session.instructorKey}>
      <LiveDashboard onForget={forget} />
    </RoleConnection>
  );
}

/**
 * The first screen ever seen on the teacher's computer.
 *
 * One button. The settings come next, on a screen that can show a preview of
 * what they do, so there is nothing to decide here.
 */
function CreateSession({ onCreated }: { onCreated(result: CreateSessionResult): void }) {
  const { send, status } = useView<unknown>();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const create = async () => {
    setBusy(true);
    setProblem(null);
    const ack = await send('createSession', {
      preset: 'standard-75',
      settings: { worlds: DEFAULT_WORLDS },
    });
    setBusy(false);
    if (ack.ok) onCreated(ack.result as CreateSessionResult);
    else setProblem(ack.message);
  };

  const offline = statusMessage(status);

  return (
    <main className="sheet">
      <h1>{APP_NAME}</h1>
      <p className="lede">You are the instructor. Nothing is running on this computer yet.</p>

      {offline !== null && (
        <Banner tone="warning" title="Offline">
          {offline}
        </Banner>
      )}

      <section className="box" aria-labelledby="create-heading">
        <h2 id="create-heading">Start a new game</h2>
        <p>
          This makes a game with three worlds of three countries, which suits about 25 students. You
          can change everything on the next screen before anyone joins.
        </p>
        {problem !== null && (
          <p className="problem" role="alert">
            {problem}
          </p>
        )}
        <Button
          tone="primary"
          size="large"
          onClick={() => void create()}
          disabled={busy || status !== 'online'}
        >
          Create session
        </Button>
      </section>
    </main>
  );
}

/** The dashboard, once the socket has a view for it. */
function LiveDashboard({ onForget }: { onForget(): void }) {
  const { view, status, send, serverNow, problem, gone } = useView<InstructorView>();

  // The saved session is not on this computer any more: a different lesson, or
  // the data was deleted. There is one thing to do about it.
  if (status === 'refused' || gone !== null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <section className="box" aria-labelledby="lost-heading">
          <h2 id="lost-heading">That game is not open on this computer</h2>
          <p role="status">{gone?.message ?? problem}</p>
          <Button tone="primary" size="large" onClick={onForget}>
            Start a new game
          </Button>
        </section>
      </main>
    );
  }

  if (view === null || view.kind !== 'instructor') {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">Opening your dashboard...</p>
      </main>
    );
  }

  // The dashboard draws its own link at the foot of whichever screen is up.
  return (
    <Dashboard
      view={view}
      send={send}
      status={status}
      serverNow={serverNow}
      onDeleted={onForget}
    />
  );
}
