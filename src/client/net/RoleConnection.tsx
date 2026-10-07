/**
 * A connection for the screens that already know who they are.
 *
 * A terminal has to look its session up first, because a printed join code names
 * a team and not a session (see sessions.ts), so ConnectionProvider does that
 * search. The instructor, the projector and the check page are different: the
 * session id and the key arrive in the link, so there is nothing to look up and
 * the socket can open on the first render.
 */

import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { Connection, type ConnectionOptions } from './connection';
import { ConnectionValueProvider, type ConnectionBundle } from './ConnectionProvider';

export interface RoleConnectionProps {
  sessionId: string;
  role: ConnectionOptions['role'];
  /** The instructor key or the projector key. Left out for setup and check. */
  authKey?: string;
  children: ReactNode;
}

export function RoleConnection({ sessionId, role, authKey, children }: RoleConnectionProps) {
  const connection = useMemo(
    () => new Connection({ sessionId, role, ...(authKey === undefined ? {} : { key: authKey }) }),
    [sessionId, role, authKey],
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

  return <ConnectionValueProvider value={bundle}>{children}</ConnectionValueProvider>;
}
