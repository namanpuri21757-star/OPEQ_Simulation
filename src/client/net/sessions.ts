/**
 * Finding the game that is running on the teacher's computer.
 *
 * A printed join code names a team, not a session, so before a terminal can say
 * hello it has to ask which session is open here. In a classroom there is one,
 * and the newest is the right answer when an old one was left behind.
 */

import type { OpenSessionSummary, OpenSessionsResponse } from '@shared/protocol';

export async function fetchOpenSessions(base = ''): Promise<OpenSessionSummary[]> {
  const response = await fetch(`${base}/api/sessions`);
  if (!response.ok) throw new Error('The game computer answered, but not with a game.');
  const body = (await response.json()) as OpenSessionsResponse;
  return body.sessions;
}

/** The session a terminal should join: the newest one on that computer. */
export function newestSession(sessions: readonly OpenSessionSummary[]): OpenSessionSummary | null {
  return [...sessions].sort((x, y) => y.createdAt - x.createdAt)[0] ?? null;
}
