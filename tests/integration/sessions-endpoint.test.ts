/**
 * GET /api/sessions.
 *
 * A terminal has to find the session before it can say hello, and this is the
 * only thing it may ask for over HTTP. The test that matters is the second one:
 * the answer must carry nothing a curious student could use for anything else.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OpenSessionsResponse } from '../../src/shared/protocol.js';
import { newSession, startServer, type Harness } from '../support/harness.js';

let harness: Harness;

async function sessions(): Promise<OpenSessionsResponse> {
  const response = await fetch(`${harness.url}/api/sessions`);
  expect(response.status).toBe(200);
  return (await response.json()) as OpenSessionsResponse;
}

beforeEach(async () => {
  harness = await startServer({ tickMs: 0 });
});

afterEach(async () => {
  await harness.cleanup();
});

describe('GET /api/sessions', () => {
  it('is an empty list before a teacher starts anything', async () => {
    expect(await sessions()).toEqual({ sessions: [] });
  });

  it('names an open session, its phase and whether a country is still free', async () => {
    const session = await newSession(harness);
    const body = await sessions();

    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toEqual({
      sessionId: session.sessionId,
      createdAt: harness.clock.now(),
      phase: 'LOBBY',
      anyFree: true,
    });
  });

  it('carries no key, no team id and no join code', async () => {
    const session = await newSession(harness);
    const text = JSON.stringify(await sessions());

    expect(text).not.toContain(session.instructorKey);
    expect(text).not.toContain(session.projectorKey);
    for (const team of session.teams) {
      expect(text).not.toContain(team.joinCode);
      expect(text).not.toContain(team.teamId);
    }
  });

  it('says when every country has been claimed', async () => {
    const session = await newSession(harness);
    for (const team of session.teams) {
      const client = await harness.client(team.teamId, {
        role: 'team',
        sessionId: session.sessionId,
      });
      const ack = await client.send('claimTeam', { joinCode: team.joinCode });
      expect(ack.ok).toBe(true);
    }

    const body = await sessions();
    expect(body.sessions[0]?.anyFree).toBe(false);
  });

  it('puts the newest session first, which is the one a terminal should join', async () => {
    const older = await newSession(harness);
    harness.clock.advance(5000);
    const newer = await newSession(harness);

    const body = await sessions();
    expect(body.sessions.map((item) => item.sessionId)).toEqual([newer.sessionId, older.sessionId]);
  });
});
