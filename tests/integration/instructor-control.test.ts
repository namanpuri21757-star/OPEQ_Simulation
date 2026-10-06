/**
 * The dashboard controls: the timer, the one suggested button, and what happens
 * when two instructor screens are open at the same time (SPEC 8.4, section 9).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextCommandId } from '../support/client.js';
import { closeYear, openGame, openYear, startPractice, submitAll } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

interface Timing {
  remainingMs: number | null;
  paused: boolean;
  deadline: number | null;
}

const timing = (view: Record<string, unknown>): Timing => view['timing'] as Timing;

describe('the timer', () => {
  it('keeps the remaining time across a pause and a resume', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    harness.clock.advance(30000);
    await game.instructor.must('pause');
    const paused = timing(game.instructor.view);

    expect(paused.paused).toBe(true);
    expect(paused.deadline).toBeNull();
    // 120 s practice timer, 30 s gone.
    expect(Math.abs((paused.remainingMs ?? 0) - 90000)).toBeLessThanOrEqual(1000);

    // Time passing while paused must not take any of it away.
    harness.clock.advance(60000);
    await game.instructor.must('resume');
    const running = timing(game.instructor.view);

    expect(running.paused).toBe(false);
    expect(Math.abs((running.remainingMs ?? 0) - 90000)).toBeLessThanOrEqual(1000);
  });

  it('adds time with extend, running or paused', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    await game.instructor.must('extend', { seconds: 30 });
    expect(Math.abs((timing(game.instructor.view).remainingMs ?? 0) - 150000)).toBeLessThanOrEqual(
      1000,
    );

    await game.instructor.must('pause');
    await game.instructor.must('extend', { seconds: 60 });
    expect(Math.abs((timing(game.instructor.view).remainingMs ?? 0) - 210000)).toBeLessThanOrEqual(
      1000,
    );
  });

  it('closes an overdue year on the tick, and saves that like a click', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await submitAll(game, 383);

    harness.clock.advance(121000);
    await harness.server.store.tick();

    await game.instructor.waitForView(
      (view) => view['phase'] === 'PRACTICE_REVEAL',
      'the tick to close the year',
    );
    expect(timing(game.instructor.view).deadline).toBeNull();
  });

  it('does not run down while the game is paused', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await game.instructor.must('pause');

    harness.clock.advance(600000);
    await harness.server.store.tick();

    expect(game.instructor.view['phase']).toBe('PRACTICE_OPEN');
  });
});

describe('two screens at once', () => {
  it('opens the year once when the same expectedYear is sent twice', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);

    const first = await game.instructor.send('openYear', { year: 1 });
    const second = await game.instructor.send(
      'openYear',
      { year: 1 },
      { expectedPhase: 'PRACTICE_REVEAL', expectedYear: 0 },
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe('STALE');
    expect(harness.server.store.get(game.session.sessionId)?.year).toBe(1);
  });

  it('moves once when two dashboards click together', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);

    const second = await harness.client('instructor-2', {
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: game.session.instructorKey,
    });

    const [a, b] = await Promise.all([
      game.instructor.send('openYear', { year: 1 }),
      second.send('openYear', { year: 1 }),
    ]);

    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(harness.server.store.get(game.session.sessionId)?.year).toBe(1);
  });

  it('counts the dashboards and projectors that are open', async () => {
    const game = await openGame(harness);
    await harness.client('instructor-2', {
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: game.session.instructorKey,
    });
    await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    const view = await game.instructor.waitForView(
      (v) => (v['screens'] as { projector: number }).projector === 1,
      'the projector to be counted',
    );
    expect(view['screens']).toMatchObject({ instructor: 2, projector: 1 });
  });
});

describe('the suggested next action', () => {
  it('walks the whole schedule one button at a time', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, years: 4, schedule: [], newProducer: { enabled: false } },
    });
    const labels: string[] = [];

    for (let step = 0; step < 40; step += 1) {
      const suggested = game.instructor.view['suggested'] as {
        command: string | null;
        label: string;
      };
      if (!suggested.command) break;
      labels.push(suggested.label);
      await game.instructor.must(
        suggested.command as 'closeYear',
        (game.instructor.view['suggested'] as { payload: Record<string, unknown> }).payload,
      );
      await game.sync();
    }

    expect(labels).toContain('Start the practice year');
    expect(labels).toContain('Close the practice year');
    expect(labels).toContain('Start Year 1');
    expect(labels).toContain('Announce the final year');
    expect(labels).toContain('End the game');
    expect(labels).toContain('Reveal results to teams');
    expect(game.instructor.view['phase']).toBe('ENDED');
  });
});

describe('overriding a decision', () => {
  it('replaces the number and logs the reason', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    const teamId = game.teams[0]?.teamId ?? '';
    await game.teams[0]?.must('submitDecision', { tenths: 383 });

    await game.instructor.must('overrideDecision', {
      teamId,
      tenths: 500,
      reason: 'Typed by mistake, agreed with the group.',
    });

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.open?.decisions.A).toMatchObject({
      tenths: 500,
      source: 'instructor',
    });
    expect(state?.overrides[0]).toMatchObject({ teamId, fromTenths: 383, toTenths: 500 });
  });

  it('is refused once the year is closed', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);

    const ack = await game.instructor.send('overrideDecision', {
      teamId: game.teams[0]?.teamId ?? '',
      tenths: 500,
      reason: 'Too late.',
    });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('CLOSED');
  });
});

describe('the burst limit', () => {
  it('asks one very busy screen to slow down', async () => {
    const game = await openGame(harness, { claimAll: false });
    const checker = await harness.client('check', {
      role: 'check',
      sessionId: game.session.sessionId,
    });

    const acks = [];
    for (let i = 0; i < 130; i += 1) {
      acks.push(await checker.send('ping', {}, { commandId: nextCommandId('ping') }));
    }

    const limited = acks.filter((ack) => !ack.ok && ack.code === 'RATE_LIMITED');
    expect(limited.length).toBeGreaterThan(0);
  });
});
