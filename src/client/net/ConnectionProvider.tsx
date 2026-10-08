/**
 * The React side of the connection: one Connection for the whole app, shared
 * through context, with useView() for screens that only want the latest view.
 *
 * Finding the session comes first, because a terminal reaches the server before
 * it knows which session is open on it (see sessions.ts).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { APP_NAME } from '@shared/constants';
import {
  Connection,
  type ConnectionSnapshot,
  type ConnectionStatus,
  type SendCommand,
} from './connection';
import { fetchOpenSessions, newestSession } from './sessions';
import { browserStore, readTerminal, type KeyValueStore } from './storage';

export interface ConnectionBundle extends ConnectionSnapshot {
  send: SendCommand;
  serverNow: () => number;
  connection: Connection;
}

const ConnectionContext = createContext<ConnectionBundle | null>(null);

export function useConnection(): ConnectionBundle {
  const bundle = useContext(ConnectionContext);
  if (!bundle) throw new Error('This screen needs a ConnectionProvider above it.');
  return bundle;
}

/** The latest view and the connection status, which is what most screens want. */
export function useView<V>(): ConnectionBundle & { view: V | null } {
  const bundle = useConnection();
  return { ...bundle, view: bundle.view as V | null };
}

export function statusMessage(status: ConnectionStatus): string | null {
  if (status === 'online') return null;
  if (status === 'refused') return null;
  return 'Reconnecting... Your decisions are saved on the instructor’s computer.';
}

interface ProviderProps {
  children: ReactNode;
  store?: KeyValueStore;
  /** Test seam: skip the lookup and use this session. */
  sessionId?: string;
}

export function ConnectionProvider({ children, store, sessionId }: ProviderProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  // A terminal that has been here before already knows its session, so that is
  // read while setting up rather than in an effect: no round trip, no flicker.
  const [found, setFound] = useState<string | null>(
    () => sessionId ?? readTerminal(keyValue)?.sessionId ?? null,
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (found !== null) return;
    let alive = true;
    fetchOpenSessions()
      .then((sessions) => {
        if (!alive) return;
        const newest = newestSession(sessions);
        if (newest) setFound(newest.sessionId);
        else setProblem('No game is open on this computer yet. Ask your teacher to start one.');
      })
      .catch(() => {
        if (alive) setProblem('This computer cannot reach the game yet. Check the Wi-Fi.');
      });
    return () => {
      alive = false;
    };
  }, [found, keyValue, attempt]);

  if (found === null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">{problem ?? 'Looking for the game on your teacher’s computer...'}</p>
        {problem !== null && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setProblem(null);
              setAttempt((n) => n + 1);
            }}
          >
            Try again
          </button>
        )}
      </main>
    );
  }

  return (
    <LiveConnection
      sessionId={found}
      store={keyValue}
      onLost={() => {
        setProblem(null);
        setFound(null);
        setAttempt((n) => n + 1);
      }}
    >
      {children}
    </LiveConnection>
  );
}

function LiveConnection({
  sessionId,
  store,
  onLost,
  children,
}: {
  sessionId: string;
  store: KeyValueStore;
  /** Called when this session turns out not to be open here any more. */
  onLost: () => void;
  children: ReactNode;
}) {
  const connection = useMemo(
    () => new Connection({ sessionId, role: 'team', store }),
    [sessionId, store],
  );
  useEffect(() => {
    connection.start();
    return () => {
      connection.stop();
    };
  }, [connection]);

  const snapshot = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const bundle = useMemo<ConnectionBundle>(
    () => ({
      ...snapshot,
      send: connection.sendCommand,
      serverNow: () => connection.serverNow(),
      connection,
    }),
    [snapshot, connection],
  );

  // The server does not know this session: the game was closed, or the computer
  // has been asleep since another lesson. There is one thing to do about it.
  if (snapshot.status === 'refused') {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <section className="box">
          <h2>This computer was in a different game</h2>
          <p role="status">{snapshot.problem}</p>
          <button type="button" className="btn btn-primary btn-large" onClick={onLost}>
            Look for the game again
          </button>
        </section>
      </main>
    );
  }

  return <ConnectionContext.Provider value={bundle}>{children}</ConnectionContext.Provider>;
}

/** Lets a test render a screen with a connection of its own making. */
export function ConnectionValueProvider({
  value,
  children,
}: {
  value: ConnectionBundle;
  children: ReactNode;
}) {
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}
