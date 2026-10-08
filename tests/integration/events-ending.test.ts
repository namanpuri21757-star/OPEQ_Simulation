/**
 * The events that change the game part way through, and how it ends
 * (SPEC section 4).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeYear,
  openGame,
  openYear,
  playYears,
  startPractice,
  submitAll,
} from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('the new producer', () => {
  it('appears from Year 9 and pushes the price down', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 9, 383);

    const world = harness.server.store.get(game.session.sessionId)?.worlds[0];
    const year8 = world?.years.find((record) => record.year === 8);
    const year9 = world?.years.find((record) => record.year === 9);

    expect(year8?.outcome.newProducerTenths).toBe(0);
    expect(year9?.outcome.newProducerTenths).toBe(150);
    expect(year9?.outcome.priceCents).toBeLessThan(year8?.outcome.priceCents ?? 0);
  });

  it('says nothing about it when it was not announced', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 9, 383);

    const reveal = game.teams[0]?.view['reveal'] as { sentence: string };
    expect(reveal.sentence).toMatch(/world supply rose/);
    expect(reveal.sentence).not.toMatch(/another producer/i);
  });

  it('names itself in the results sentence when it was announced', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, schedule: [], newProducer: { announced: true, year: 2 } },
    });
    await playYears(game, 2, 383);

    const reveal = game.teams[0]?.view['reveal'] as { sentence: string };
    expect(reveal.sentence).toMatch(/another producer joined the market/);
  });

  it('can be brought forward by hand between years', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);
    await openYear(game, 1);
    await submitAll(game, 383);
    await closeYear(game);

    await game.instructor.must('fireEvent', { kind: 'newProducer' });
    await openYear(game, 2);
    await submitAll(game, 383);
    await closeYear(game);

    const world = harness.server.store.get(game.session.sessionId)?.worlds[0];
    expect(world?.years[1]?.outcome.newProducerTenths).toBe(150);
    expect(harness.server.store.get(game.session.sessionId)?.firedEvents[0]).toMatchObject({
      kind: 'newProducer',
      year: 2,
    });
  });

  it('cannot be fired twice', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, schedule: [], newProducer: { year: 1 } },
    });
    await playYears(game, 1, 383);

    const ack = await game.instructor.send('fireEvent', { kind: 'newProducer' });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NOT_ALLOWED');
    expect(ack.message).toMatch(/already in the market/);
  });
});

describe('the final-year warning', () => {
  it('is suggested before the last year and then announced to everyone', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, years: 3, schedule: [], newProducer: { enabled: false } },
    });
    await playYears(game, 2, 383);

    expect(game.instructor.view['suggested']).toMatchObject({
      command: 'announceFinalYear',
      label: 'Announce the final year',
    });

    await game.instructor.must('announceFinalYear');
    await game.sync();

    // Every screen reads finalYearAnnounced: there is no news feed any more.
    expect(game.teams[0]?.view['finalYearAnnounced']).toBe(true);
  });

  it('is refused when the next year is not the last one', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 1, 383);

    const ack = await game.instructor.send('announceFinalYear');

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.message).toMatch(/not the last one/);
  });

  it('is refused when the warning is turned off for this game', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 1,
        years: 2,
        timers: { earlyYearsThrough: 2 },
        schedule: [],
        newProducer: { enabled: false },
        finalYearWarning: false,
      },
    });
    await playYears(game, 1, 383);

    const ack = await game.instructor.send('announceFinalYear');

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.message).toMatch(/turned off/);
    expect(game.instructor.view['suggested']).toMatchObject({ command: 'openYear' });
  });
});

describe('ending the game', () => {
  it('stops the clock and drops any year that was still open', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 1, 383);
    await openYear(game, 2);
    await submitAll(game, 500);

    await game.instructor.must('endGame');
    await game.sync();

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.phase).toBe('ENDED');
    expect(state?.worlds[0]?.open).toBeNull();
    expect(state?.worlds[0]?.years).toHaveLength(1);
    expect(state?.timer.deadline).toBeNull();
  });

  it('takes reflections only once the game has ended', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 1, 383);

    const tooEarly = await game.teams[0]?.send('submitReflection', {
      answers: ['a', 'b', 'c'],
    });
    expect(tooEarly?.ok).toBe(false);

    await game.instructor.must('endGame');
    await game.sync();
    await game.teams[0]?.must('submitReflection', {
      answers: ['We cooperated best in Year 1.', 'Nobody broke a promise.', 'Talk sooner.'],
    });

    expect(game.teams[0]?.view['reflection']).toMatchObject({
      answers: ['We cooperated best in Year 1.', 'Nobody broke a promise.', 'Talk sooner.'],
    });
  });

  it('opens the leaderboard to teams only when the instructor releases it', async () => {
    const game = await openGame(harness, { settings: { worlds: 2, schedule: [] } });
    await playYears(game, 1, 383);
    await game.instructor.must('endGame');
    await game.sync();

    expect(game.teams[0]?.view['resultsRevealed']).toBe(false);
    expect(game.teams[0]?.view['leaderboard']).toBeNull();

    await game.instructor.must('revealResultsToTeams');
    await game.sync();

    expect(game.teams[0]?.view['resultsRevealed']).toBe(true);
    const leaderboard = game.teams[0]?.view['leaderboard'] as {
      countries: unknown[];
      worlds: Array<{ worldNumber: number; cooperativeMaxK: number }>;
    };
    expect(leaderboard.countries).toHaveLength(6);
    expect(leaderboard.worlds[0]?.cooperativeMaxK).toBe(3967500);
  });

  it('mirrors a debrief screen onto the projector', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await game.instructor.must('setProjectorScreen', { screen: 'leaderboard' });

    const view = await projector.waitForView(
      (v) => v['screen'] === 'leaderboard',
      'the mirrored screen',
    );
    expect(view['screen']).toBe('leaderboard');
  });
});

describe('between-years activities', () => {
  it('offers the scheduled messaging window and summit, and only once each', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 1,
        years: 4,
        schedule: [
          { afterYear: 1, kind: 'chat', seconds: 240 },
          { afterYear: 2, kind: 'summit', seconds: 300 },
        ],
        newProducer: { enabled: false },
      },
    });
    await playYears(game, 1, 383);

    // A scheduled window is no longer a phase: it is the messaging switch.
    expect(game.instructor.view['suggested']).toMatchObject({
      command: 'setMessaging',
      label: 'Turn messaging on for 4 min',
      payload: { on: true, seconds: 240 },
    });
    await game.instructor.must('setMessaging', { on: true, seconds: 240 });
    await game.sync();
    expect(game.teams[0]?.view['messaging']).toMatchObject({ on: true });
    // The phase has not moved: the room is still looking at the results.
    expect(game.teams[0]?.view['phase']).toBe('YEAR_REVEAL');

    // Messaging is still on, so that is what to deal with next.
    expect(game.instructor.view['suggested']).toMatchObject({
      command: 'setMessaging',
      label: 'Turn messaging off',
    });
    await game.instructor.must('setMessaging', { on: false });
    await game.sync();
    // The window has been run, so the next suggestion moves the game on.
    expect(game.instructor.view['suggested']).toMatchObject({ command: 'openYear' });

    await playYear(game, 2);
    expect(game.instructor.view['suggested']).toMatchObject({
      label: 'Hold the summit (5 min)',
    });
  });

  it('ends a between-years activity on the tick when its time runs out', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, schedule: [] } });
    await playYears(game, 1, 383);
    await game.instructor.must('startBetween', { kind: 'summit', seconds: 300 });

    harness.clock.advance(301000);
    await harness.server.store.tick();

    await game.instructor.waitForView(
      (view) => view['phase'] === 'YEAR_REVEAL',
      'the summit to end itself',
    );
    expect(harness.server.store.get(game.session.sessionId)?.between).toBeNull();
  });
});

/** Local because this file plays a year without the practice run in front. */
async function playYear(game: Awaited<ReturnType<typeof openGame>>, year: number) {
  await openYear(game, year);
  await submitAll(game, 383);
  await closeYear(game);
}
