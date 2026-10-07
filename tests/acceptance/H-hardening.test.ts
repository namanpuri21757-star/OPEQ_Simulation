/**
 * The hardening review, written down as tests.
 *
 * Prompt 7 asked for a review of five things. Four of them can be checked by a
 * machine, so they are here rather than in a note somebody has to trust:
 *
 *   H1 nothing is left running after the server is shut down,
 *   H2 nothing is remembered about a socket that has closed,
 *   H3 a client cannot change state except through a command, and every
 *      command gets an ack even when something goes wrong inside the server,
 *   H4 every view a socket can be sent comes from one of the four allow-listed
 *      builders, and no raw-state field reaches a screen that is not the
 *      instructor's.
 *
 * The fifth - unhandled promise rejections - is checked by listening for them
 * while the rest of the file runs.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEvents, sessionDir } from '../../src/server/store/files.js';
import { PHASES, type SessionState } from '../../src/shared/state.js';
import { GameClient } from '../support/client.js';
import { openGame, playYears, startPractice } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

/**
 * Fields of the raw session state that no screen but the instructor's may hold.
 *
 * `teams`, `results` and `resultOrder` are bookkeeping; `seed` would let a
 * client predict production variance; the two keys are the keys.
 */
const INSTRUCTOR_ONLY_FIELDS: Array<keyof SessionState> = [
  'seed',
  'instructorKey',
  'projectorKey',
  'teams',
  'results',
  'resultOrder',
  'overrides',
  'networkChecks',
  'firedEvents',
  'activitiesDone',
];

let harness: Harness;
const unhandled: unknown[] = [];

const keep = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(async () => {
  unhandled.length = 0;
  process.on('unhandledRejection', keep);
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
  // Give anything in flight a turn to reject before the check below.
  await new Promise((resolve) => setTimeout(resolve, 50));
  process.off('unhandledRejection', keep);
  expect(unhandled, `unhandled rejections: ${unhandled.map(String).join(', ')}`).toEqual([]);
});

describe('H1 - shutting down', () => {
  it('leaves no session, no socket and no timer behind', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });
    await startPractice(game);
    await game.instructor.must('pause');

    const sessionId = game.session.sessionId;
    expect(harness.server.store.sessionIds()).toEqual([sessionId]);
    expect(harness.server.io.sockets.sockets.size).toBeGreaterThan(0);

    await harness.server.close();

    // The store forgets every session, so a later tick has nothing to act on.
    expect(harness.server.store.sessionIds()).toEqual([]);
    expect(harness.server.store.get(sessionId)).toBeUndefined();
    // The sockets are gone, and so is what the socket layer remembered.
    expect(harness.server.io.sockets.sockets.size).toBe(0);
    expect(harness.server.sockets.presence(sessionId)).toEqual({});
    expect(harness.server.http.listening).toBe(false);

    // A tick after a shutdown must do nothing rather than throw. If the 1-second
    // interval were still running, this is what it would be doing.
    harness.clock.advance(10 * 60 * 1000);
    await harness.server.store.tick();
    expect(harness.warnings).toEqual([]);
  });

  it('answers nothing on a port it has given up', async () => {
    await harness.server.close();
    await expect(fetch(`${harness.url}/api/health`)).rejects.toThrow();
  });
});

describe('H2 - a socket that has closed', () => {
  it('is forgotten, with nothing kept about it but the time it was last seen', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 } });
    const sessionId = game.session.sessionId;

    // Twenty screens come and go, which is a lesson where the wifi is poor.
    for (let round = 0; round < 20; round += 1) {
      const client = new GameClient(harness.url, `passer-by-${String(round)}`);
      await client.hello({ role: 'team', sessionId });
      await client.send('ping');
      client.close();
    }
    // The server notices they have gone.
    await game.instructor.waitForView(
      () => harness.server.io.sockets.sockets.size <= 10,
      'the passing sockets to be closed',
    );

    // Only the screens that are still here are still here.
    const live = harness.server.io.sockets.sockets.size;
    expect(live).toBe(10); // nine terminals and the instructor

    // Now the terminals go too.
    for (const team of game.teams) team.close();
    await game.instructor.waitForView(
      () => harness.server.io.sockets.sockets.size === 1,
      'the terminals to be closed',
    );

    // Presence says offline for every country, and keeps only a last-seen time.
    const presence = harness.server.sockets.presence(sessionId);
    expect(Object.keys(presence)).toHaveLength(9);
    for (const entry of Object.values(presence)) {
      expect(entry.connected).toBe(false);
      expect(typeof entry.lastSeenAt).toBe('number');
    }
    // And who was connected was never written to disk.
    const { events } = await readEvents(sessionDir(harness.dataDir, sessionId), () => undefined);
    expect(JSON.stringify(events)).not.toContain('connected');
    expect(JSON.stringify(events)).not.toContain('lastSeenAt');
  });

  it('forgets a whole session when it is deleted', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const sessionId = game.session.sessionId;
    await game.instructor.send('deleteSession', { confirm: 'DELETE' });

    expect(harness.server.store.get(sessionId)).toBeUndefined();
    expect(harness.server.store.sessionIds()).toEqual([]);
    expect(harness.server.sockets.presence(sessionId)).toEqual({});
  });
});

describe('H3 - a client can only change state with a command', () => {
  it('always gets an ack, even for nonsense, and never hangs waiting', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');
    await startPractice(game);

    const nonsense: unknown[] = [
      null,
      42,
      'submitDecision',
      [],
      {},
      { commandId: 'a' },
      { commandId: 'a-long-enough-id', type: 'notACommand', payload: {} },
      { commandId: 'a-long-enough-id-2', type: 'submitDecision' },
      { commandId: 'a-long-enough-id-3', type: 'submitDecision', payload: null },
      { commandId: '', type: 'submitDecision', payload: { tenths: 1 } },
      { commandId: 'a-long-enough-id-4', type: 'submitDecision', payload: { tenths: -1 } },
      { commandId: 'a-long-enough-id-5', type: 'submitDecision', payload: { tenths: 1.5 } },
    ];

    for (const raw of nonsense) {
      // sendRaw would reject on a timeout, which is the failure this is about.
      const ack = await team.sendRaw(raw);
      expect(ack.ok, `${JSON.stringify(raw)} was accepted`).toBe(false);
      if (!ack.ok) expect(ack.message.length).toBeGreaterThan(5);
    }

    // Nothing changed.
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.open?.decisions['A']).toBeUndefined();
    expect(state?.phase).toBe('PRACTICE_OPEN');
  });

  it('holds the burst limit, and says so kindly', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    const acks = [];
    for (let i = 0; i < 140; i += 1) acks.push(await team.send('ping'));

    const refused = acks.filter((ack) => !ack.ok);
    expect(refused.length).toBeGreaterThan(0);
    for (const ack of refused) {
      if (ack.ok) continue;
      expect(ack.code).toBe('RATE_LIMITED');
      expect(ack.message).toMatch(/Give it a moment/);
    }
    // And the session is untouched: a flood cannot move the game.
    expect(harness.server.store.get(game.session.sessionId)?.phase).toBe('LOBBY');
  });
});

describe('H4 - every view comes from an allow-list', () => {
  it('sends only the four shapes, and never a raw-state field to anyone else', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 2,
        years: 2,
        schedule: [],
        newProducer: { enabled: false },
        timers: { earlyYearsThrough: 1 },
      },
    });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    const unclaimed = await harness.client('unclaimed', {
      role: 'team',
      sessionId: game.session.sessionId,
    });
    const checkPage = await harness.client('check', {
      role: 'check',
      sessionId: game.session.sessionId,
    });

    await playYears(game, 2, 383);
    await game.instructor.must('endGame');
    await game.instructor.must('revealResultsToTeams');
    await game.instructor.must('setProjectorScreen', { screen: 'worldDetail', worldNumber: 1 });
    await game.sync();

    const everyone = [...game.teams, game.instructor, projector, unclaimed, checkPage];

    for (const client of everyone) {
      expect(client.views.length, `${client.name} was sent no view`).toBeGreaterThan(0);
      for (const message of client.views) {
        const view = message.view as Record<string, unknown>;
        // One of the four shapes, every time.
        expect(['team', 'projector', 'instructor', 'lobby'], `${client.name}`).toContain(
          view['kind'],
        );
        // The phase is always a real phase, so nothing half-built goes out.
        if (view['phase'] !== undefined) expect(PHASES).toContain(view['phase']);

        if (view['kind'] === 'instructor') continue;
        for (const field of INSTRUCTOR_ONLY_FIELDS) {
          expect(
            Object.hasOwn(view, field),
            `${client.name} was sent the raw "${field}" field`,
          ).toBe(false);
        }
      }
    }

    // The lobby view really is almost nothing, which is the point of it.
    const lobby = unclaimed.view;
    expect(lobby['kind']).toBe('lobby');
    expect(Object.keys(lobby).sort()).toEqual(
      ['anyFree', 'kind', 'phase', 'sessionId', 'timing', 'version'].sort(),
    );
    // And the /check page gets the same almost-nothing.
    expect(checkPage.view['kind']).toBe('lobby');
  });
});
