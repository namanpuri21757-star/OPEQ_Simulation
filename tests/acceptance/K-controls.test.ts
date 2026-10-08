/**
 * K1 to K4 - the controls a teacher uses while standing up, with the room
 * watching.
 *
 * K1 pause and resume reach every screen within a second.
 * K2 +30 s and Close now reach every screen within a second.
 * K3 a double-click, and a second dashboard on another laptop, advance once.
 * K4 an event fires once, and only in the worlds it should.
 *
 * "Reaches a screen" means that screen has been sent a view it could draw the
 * change from, measured in real time against a real socket, because the one
 * second in the criterion is a second of a lesson.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import { readEvents, sessionDir } from '../../src/server/store/files.js';
import type { GameClient } from '../support/client.js';
import {
  closeYear,
  openGame,
  openYear,
  startPractice,
  submitAll,
  type OpenGame,
} from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

/** Everything in K1 and K2 must be visible everywhere inside this. */
const REACH_LIMIT_MS = 1000;

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** Every screen in the room: nine terminals, the projector, the dashboard. */
async function wholeRoom(game: OpenGame): Promise<GameClient[]> {
  const projector = await harness.client('projector', {
    role: 'projector',
    sessionId: game.session.sessionId,
    projectorKey: game.session.projectorKey,
  });
  return [...game.teams, projector, game.instructor];
}

/**
 * How long the slowest screen took to see something, in milliseconds.
 *
 * Every screen is watched before the command is sent, so nothing can be missed
 * between the two.
 */
async function timeToReachAll(
  screens: GameClient[],
  predicate: (view: Record<string, unknown>) => boolean,
  what: string,
  act: () => Promise<void>,
): Promise<number> {
  const started = Date.now();
  const waits = screens.map(async (screen) => {
    await screen.waitForView(predicate, `${screen.name} to see ${what}`, 5000);
    return Date.now() - started;
  });
  await act();
  const times = await Promise.all(waits);
  return Math.max(...times);
}

describe('K1 - pause and resume', () => {
  it('reaches every screen in the room within a second, both ways', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 } });
    const screens = await wholeRoom(game);
    await startPractice(game);

    const pausedIn = await timeToReachAll(
      screens,
      (view) => (view['timing'] as { paused: boolean } | undefined)?.paused === true,
      'the pause',
      async () => {
        const ack = await game.instructor.send('pause');
        expect(ack.ok).toBe(true);
      },
    );
    expect(pausedIn, `the pause took ${String(pausedIn)} ms to reach everyone`).toBeLessThan(
      REACH_LIMIT_MS,
    );

    // The remaining time is kept, which is the point of pausing at all.
    for (const screen of screens) {
      const timing = screen.view['timing'] as { paused: boolean; remainingMs: number | null };
      expect(timing.paused).toBe(true);
      expect(timing.remainingMs).toBeGreaterThan(0);
    }

    const resumedIn = await timeToReachAll(
      screens,
      (view) => (view['timing'] as { paused: boolean } | undefined)?.paused === false,
      'the resume',
      async () => {
        const ack = await game.instructor.send('resume');
        expect(ack.ok).toBe(true);
      },
    );
    expect(resumedIn, `the resume took ${String(resumedIn)} ms to reach everyone`).toBeLessThan(
      REACH_LIMIT_MS,
    );

    for (const screen of screens) {
      const timing = screen.view['timing'] as { paused: boolean; deadline: number | null };
      expect(timing.paused).toBe(false);
      expect(timing.deadline).not.toBeNull();
    }
  });
});

describe('K2 - plus thirty seconds, and Close now', () => {
  it('both reach every screen in the room within a second', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 } });
    const screens = await wholeRoom(game);
    await startPractice(game);
    await game.sync();

    const before = (game.instructor.view['timing'] as { seconds: number }).seconds;

    const extendedIn = await timeToReachAll(
      screens,
      (view) => ((view['timing'] as { seconds: number | null }).seconds ?? 0) >= before + 30,
      'the extra 30 seconds',
      async () => {
        const ack = await game.instructor.send('extend', { seconds: 30 });
        expect(ack.ok).toBe(true);
      },
    );
    expect(extendedIn, `+30 s took ${String(extendedIn)} ms to reach everyone`).toBeLessThan(
      REACH_LIMIT_MS,
    );

    const closedIn = await timeToReachAll(
      screens,
      (view) => view['phase'] === 'PRACTICE_REVEAL',
      'the close',
      async () => {
        const ack = await game.instructor.send(
          'closeYear',
          {},
          {
            expectedPhase: 'PRACTICE_OPEN',
            expectedYear: 0,
          },
        );
        expect(ack.ok).toBe(true);
      },
    );
    expect(closedIn, `Close now took ${String(closedIn)} ms to reach everyone`).toBeLessThan(
      REACH_LIMIT_MS,
    );

    // Everyone, the projector included, is on the reveal.
    for (const screen of screens) expect(screen.phase).toBe('PRACTICE_REVEAL');
  });
});

describe('K3 - a double-click, and two dashboards', () => {
  it('advances exactly once when the big button is pressed twice in a row', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);

    // Two clicks, each with the guards the screen was showing at the time -
    // which is what a double-click really is.
    const guards = { expectedPhase: 'PRACTICE_REVEAL' as const, expectedYear: 0 };
    const [first, second] = await Promise.all([
      game.instructor.send('openYear', { year: 1 }, guards),
      game.instructor.send('openYear', { year: 1 }, guards),
    ]);

    const results = [first, second];
    expect(results.filter((ack) => ack.ok)).toHaveLength(1);
    const refused = results.find((ack) => !ack.ok);
    expect(refused?.ok).toBe(false);
    if (refused && !refused.ok) expect(refused.code).toBe('STALE');

    await game.instructor.waitForView((view) => view['year'] === 1, 'Year 1 on the dashboard');
    await game.sync();
    expect(game.instructor.phase).toBe('YEAR_OPEN');

    // Only one of the two clicks changed anything: one open year, numbered 1,
    // and nothing scored yet.
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.years).toHaveLength(0);
    expect(state?.worlds[0]?.open?.year).toBe(1);

    // Only the accepted click is in the saved log. A refusal that changed
    // nothing is never written, so a replay of the log cannot open Year 1 twice.
    const { events } = await readEvents(
      sessionDir(harness.dataDir, game.session.sessionId),
      () => undefined,
    );
    expect(events.filter((event) => event.command.type === 'openYear')).toHaveLength(1);
  });

  it('advances exactly once when two instructor tabs both press the button', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const second = await harness.client('second-tab', {
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: game.session.instructorKey,
    });

    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);
    await second.waitForView((view) => view['phase'] === 'PRACTICE_REVEAL', 'the reveal');

    // Both tabs show the same suggested action, which is the whole point of the
    // server deciding it; both press it at the same moment.
    const suggestedOf = (client: GameClient) =>
      client.view['suggested'] as {
        command: string;
        label: string;
        payload: Record<string, unknown>;
        expectedPhase: 'PRACTICE_REVEAL';
        expectedYear: number;
      };
    const one = suggestedOf(game.instructor);
    const two = suggestedOf(second);
    expect(one.command).toBe('openYear');
    expect(one.command).toBe(two.command);
    expect(one.label).toBe(two.label);

    const acks = await Promise.all([
      game.instructor.send('openYear', one.payload, {
        expectedPhase: one.expectedPhase,
        expectedYear: one.expectedYear,
      }),
      second.send('openYear', two.payload, {
        expectedPhase: two.expectedPhase,
        expectedYear: two.expectedYear,
      }),
    ]);

    expect(acks.filter((ack) => ack.ok)).toHaveLength(1);
    await game.instructor.waitForView((view) => view['year'] === 1, 'Year 1 on the dashboard');
    await second.waitForView((view) => view['year'] === 1, 'Year 1 on the second tab');
    await game.sync();
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.open?.year).toBe(1);
    expect(state?.worlds[0]?.years).toHaveLength(0);
  });
});

describe('K4 - events fire once, in the right worlds', () => {
  it('brings the new producer into every world once, and never twice', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 3,
        newProducer: { enabled: false },
        years: 6,
        schedule: [{ afterYear: 3, kind: 'chat', seconds: 60 }],
      },
    });
    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);

    await openYear(game, 1);
    await submitAll(game, 383);
    await closeYear(game);

    // Two clicks on "Bring in the new producer", at the same instant.
    const guards = { expectedPhase: 'YEAR_REVEAL' as const, expectedYear: 1 };
    const fired = await Promise.all([
      game.instructor.send('fireEvent', { kind: 'newProducer' }, guards),
      game.instructor.send('fireEvent', { kind: 'newProducer' }, guards),
    ]);
    // The first sets it for next year; the second is refused because the same
    // event cannot be scheduled twice.
    expect(fired.filter((ack) => ack.ok)).toHaveLength(1);
    await game.sync();

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.firedEvents).toHaveLength(1);
    expect(state?.firedEvents[0]).toMatchObject({ kind: 'newProducer', year: 2 });

    await openYear(game, 2);
    await submitAll(game, 383);
    await closeYear(game);
    await game.sync();

    const after = harness.server.store.get(game.session.sessionId);
    if (!after) throw new Error('the session went away');

    // Every world felt it, and felt it equally: the extra barrels are in the
    // market, so every world's Year 2 total is above its Year 1 total.
    for (const world of after.worlds) {
      const year1 = world.years.find((row) => row.year === 1);
      const year2 = world.years.find((row) => row.year === 2);
      expect(year2?.outcome.newProducerTenths).toBe(150);
      expect(year1?.outcome.newProducerTenths).toBe(0);
      expect(year2?.outcome.totalTenths).toBeGreaterThan(year1?.outcome.totalTenths ?? 0);
      expect(year2?.outcome.priceCents).toBeLessThan(year1?.outcome.priceCents ?? 0);
      for (const letter of COUNTRY_LETTERS) {
        // The countries produced the same as last year, so the price drop is
        // the event and nothing else.
        expect(year2?.decisions[letter].tenths).toBe(year1?.decisions[letter].tenths);
      }
    }

    // And it is refused a second time now that it has happened.
    const again = await game.instructor.send(
      'fireEvent',
      { kind: 'newProducer' },
      {
        expectedPhase: 'YEAR_REVEAL',
        expectedYear: 2,
      },
    );
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('NOT_ALLOWED');
  });

  it('turns messaging on for one world only when the instructor picks one', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 } });
    await startPractice(game);

    const worldOne = game.world(1)['A'];
    const worldTwo = game.world(2)['A'];
    if (!worldOne || !worldTwo) throw new Error('missing terminals');

    await game.instructor.must('setMessaging', { on: true, worldIds: ['world-1'] });
    await game.sync();

    const messagingFor = (client: GameClient) =>
      client.view['messaging'] as { on: boolean } | undefined;

    expect(messagingFor(worldOne)?.on).toBe(true);
    expect(messagingFor(worldTwo)?.on).toBe(false);
  });
});
