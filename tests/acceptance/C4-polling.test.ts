/**
 * C4 - a school that blocks WebSocket.
 *
 * Plenty of school networks allow ordinary HTTP and nothing else, so socket.io
 * falls back to long polling. Everything has to work over it: the eleven
 * screens connect, a whole year is played, and the results are the same. The
 * only difference a teacher should notice is that it feels slightly slower.
 *
 * The clients here are given `transports: ['polling']`, so there is no
 * WebSocket to fall back from - this really is a network where it never works.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { ClaimTeamResult } from '../../src/shared/protocol.js';
import { GameClient } from '../support/client.js';
import { closeYear, openGame, openYear, startPractice } from '../support/game.js';
import { newSession, startServer, type Harness } from '../support/harness.js';

const POLLING = { transports: ['polling'] as Array<'polling'> };
const ALL_CONNECTED_LIMIT_MS = 10_000;
const OWN_COUNTRY_LIMIT_MS = 2_000;

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('C4 - polling only', () => {
  it('C1 again with WebSockets disabled: everyone in, each knowing its country', async () => {
    const session = await newSession(harness, { settings: { worlds: 3 }, client: POLLING });
    const started = Date.now();

    const joins = session.teams.map(async (team) => {
      const client = new GameClient(harness.url, team.teamId, POLLING);
      harness.track(client);
      const hello = await client.hello({ role: 'team', sessionId: session.sessionId });
      if (!hello.ok) throw new Error(`${team.teamId}: ${hello.message}`);
      const askedAt = Date.now();
      const ack = await client.send('claimTeam', { joinCode: team.joinCode });
      if (!ack.ok) throw new Error(`${team.teamId}: ${ack.message}`);
      await client.waitForView((view) => view['kind'] === 'team', 'its own country view');
      return {
        team,
        result: ack.result as ClaimTeamResult,
        ownCountryMs: Date.now() - askedAt,
        transport: client.socket.io.engine.transport.name,
      };
    });

    const projector = (async () => {
      const client = new GameClient(harness.url, 'projector', POLLING);
      harness.track(client);
      const hello = await client.hello({
        role: 'projector',
        sessionId: session.sessionId,
        projectorKey: session.projectorKey,
      });
      if (!hello.ok) throw new Error(`projector: ${hello.message}`);
      await client.waitForView((view) => view['kind'] === 'projector', 'the room screen');
      return client;
    })();

    const dashboard = (async () => {
      const client = new GameClient(harness.url, 'dashboard', POLLING);
      harness.track(client);
      const hello = await client.hello({
        role: 'instructor',
        sessionId: session.sessionId,
        instructorKey: session.instructorKey,
      });
      if (!hello.ok) throw new Error(`dashboard: ${hello.message}`);
      await client.waitForView((view) => view['kind'] === 'instructor', 'the dashboard');
      return client;
    })();

    const [joined, room, desk] = await Promise.all([Promise.all(joins), projector, dashboard]);
    const allConnectedMs = Date.now() - started;

    expect(allConnectedMs).toBeLessThan(ALL_CONNECTED_LIMIT_MS);
    for (const entry of joined) {
      // Polling really is what carried it, so the test proves what it claims.
      expect(entry.transport).toBe('polling');
      expect(entry.result.teamId).toBe(entry.team.teamId);
      expect(entry.ownCountryMs).toBeLessThan(OWN_COUNTRY_LIMIT_MS);
    }
    expect(new Set(joined.map((entry) => entry.result.teamId)).size).toBe(9);
    expect(room.socket.io.engine.transport.name).toBe('polling');
    expect(desk.socket.io.engine.transport.name).toBe('polling');
  });

  it('plays a full year over polling and resolves it the same way', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 }, client: POLLING });

    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);

    for (const [index, team] of game.teams.entries()) {
      expect(team.socket.io.engine.transport.name).toBe('polling');
      await team.must('recordHuddle', {
        suggestions: [{ name: 'Ada', tenths: 380 + index }],
        reason: 'Over polling, same as always.',
      });
      await team.must('submitDecision', { tenths: 380 + index });
      await team.must('submitPrediction', { othersTenths: [383, 383], trust: 4 });
    }

    await closeYear(game);
    await game.sync();

    const state = harness.server.store.get(game.session.sessionId);
    if (!state) throw new Error('the session went away');

    for (const world of state.worlds) {
      const record = world.years.find((row) => row.year === 1);
      expect(record, `world ${String(world.worldNumber)} has no Year 1`).toBeDefined();
      for (const letter of COUNTRY_LETTERS) {
        expect(record?.decisions[letter].auto).toBe(false);
      }
      expect(record?.outcome.priceCents).toBeGreaterThan(0);
    }

    // And every terminal can see its own reveal, which is the thing a student
    // would notice if polling were half working.
    for (const team of game.teams) {
      const reveal = team.view['reveal'] as { priceCents: number } | null;
      expect(reveal?.priceCents).toBeGreaterThan(0);
    }
  });
});
