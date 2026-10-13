/**
 * The teacher's round plan and automatic progression.
 *
 * autoAdvance: once every country in every world has submitted (autoClose), or
 * the timer runs out, the year closes; after AUTO_ADVANCE_SECONDS on the results
 * the next year opens by itself, exactly once.
 *
 * rounds: one row per scored year with its own timer, and whether it has
 * messaging, face-to-face talks and every world's totals on the projector.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AUTO_ADVANCE_SECONDS } from '../../src/shared/constants.js';
import type { RoundPlan } from '../../src/shared/settings.js';
import { openGame, startPractice, submitAll, type OpenGame } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

const HOLD_MS = AUTO_ADVANCE_SECONDS * 1000;

async function countEvents(sessionId: string, type: string): Promise<number> {
  const raw = await readFile(join(harness.dataDir, 'sessions', sessionId, 'events.jsonl'), 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .filter((line) => (JSON.parse(line) as { command?: { type?: string } }).command?.type === type)
    .length;
}

function state(game: OpenGame) {
  const found = harness.server.store.get(game.session.sessionId);
  if (!found) throw new Error('no session');
  return found;
}

/** Everyone submits, then waits for the year to close itself. */
async function everyoneSubmits(game: OpenGame, phase: string): Promise<void> {
  await submitAll(game, 383);
  await game.instructor.waitForView((view) => view['phase'] === phase, `the phase ${phase}`);
}

async function tickAfterHold(): Promise<void> {
  harness.clock.advance(HOLD_MS);
  await harness.server.store.tick();
}

/** Waits until every screen has seen the year the tick just opened. */
async function seesYear(game: OpenGame, year: number): Promise<void> {
  await game.instructor.waitForView(
    (view) => view['phase'] === 'YEAR_OPEN' && view['year'] === year,
    `Year ${String(year)} to open`,
  );
  await game.sync();
}

/** A short game has to drop the standard plan's later activities and event. */
const SHORT = { schedule: [], newProducer: { enabled: false }, timers: { earlyYearsThrough: 0 } };
const AUTO = { ...SHORT, autoClose: true, autoAdvance: true, finalYearWarning: false };

describe('automatic progression', () => {
  it('closes when everyone has submitted and opens the next year by itself, once', async () => {
    const game = await openGame(harness, { settings: { worlds: 2, years: 3, ...AUTO } });
    await startPractice(game);

    await everyoneSubmits(game, 'PRACTICE_REVEAL');
    expect(game.instructor.view['advanceAt']).toBe(harness.clock.now() + HOLD_MS);

    // Not before the results have been on screen for the hold.
    harness.clock.advance(HOLD_MS - 1000);
    await harness.server.store.tick();
    expect(state(game).phase).toBe('PRACTICE_REVEAL');

    harness.clock.advance(1000);
    await harness.server.store.tick();
    expect(state(game).phase).toBe('YEAR_OPEN');
    expect(state(game).year).toBe(1);

    // More ticks never open it again.
    await harness.server.store.tick();
    await tickAfterHold();
    expect(state(game).year).toBe(1);
    expect(await countEvents(game.session.sessionId, 'openYear')).toBe(1);
    expect(await countEvents(game.session.sessionId, 'closeYear')).toBe(1);
  });

  it('also moves on after a year that closed on its timer', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, years: 2, ...AUTO, autoClose: false },
    });
    await startPractice(game);
    harness.clock.advance(121000);
    await harness.server.store.tick();
    expect(state(game).phase).toBe('PRACTICE_REVEAL');

    await tickAfterHold();
    expect(state(game).phase).toBe('YEAR_OPEN');
  });

  it('stops after the last year and leaves the end of the game to the teacher', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, years: 1, ...AUTO } });
    await startPractice(game);
    await everyoneSubmits(game, 'PRACTICE_REVEAL');
    await tickAfterHold();
    await seesYear(game, 1);
    await everyoneSubmits(game, 'YEAR_REVEAL');

    expect(game.instructor.view['advanceAt']).toBeNull();
    await tickAfterHold();
    expect(state(game).phase).toBe('YEAR_REVEAL');
  });

  it('gives the final-year warning on the way, when it is on', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, years: 2, ...AUTO, finalYearWarning: true },
    });
    await startPractice(game);
    await everyoneSubmits(game, 'PRACTICE_REVEAL');
    await tickAfterHold();
    await seesYear(game, 1);
    await everyoneSubmits(game, 'YEAR_REVEAL');

    await tickAfterHold();
    expect(state(game).finalYearAnnounced).toBe(true);
    await harness.server.store.tick();
    expect(state(game).phase).toBe('YEAR_OPEN');
    expect(state(game).year).toBe(2);
  });

  it('waits for the teacher when it is off', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, autoClose: true } });
    await startPractice(game);
    await everyoneSubmits(game, 'PRACTICE_REVEAL');
    expect(game.instructor.view['advanceAt']).toBeNull();
    await tickAfterHold();
    expect(state(game).phase).toBe('PRACTICE_REVEAL');
  });

  for (const worlds of [1, 4, 6]) {
    it(`plays a whole game by itself with ${String(worlds)} world(s)`, async () => {
      const years = 3;
      const game = await openGame(harness, { settings: { worlds, years, ...AUTO } });
      expect(game.teams).toHaveLength(worlds * 3);
      await startPractice(game);
      await everyoneSubmits(game, 'PRACTICE_REVEAL');

      for (let year = 1; year <= years; year += 1) {
        await tickAfterHold();
        await seesYear(game, year);
        await everyoneSubmits(game, 'YEAR_REVEAL');
      }

      expect(state(game).worlds).toHaveLength(worlds);
      for (const world of state(game).worlds) expect(world.years).toHaveLength(years);
      expect(await countEvents(game.session.sessionId, 'openYear')).toBe(years);
    });
  }
});

describe('the round plan', () => {
  const plan: RoundPlan[] = [
    { seconds: 30, messaging: true, faceToFace: false, seeAllTotals: false },
    { seconds: 45, messaging: false, faceToFace: true, seeAllTotals: true },
    { seconds: 60, messaging: true, faceToFace: true, seeAllTotals: false },
  ];

  async function planned(): Promise<OpenGame> {
    const game = await openGame(harness, {
      settings: { worlds: 2, years: 3, ...SHORT, rounds: plan },
    });
    await startPractice(game);
    await game.instructor.must('closeYear');
    return game;
  }

  it('gives each round its own timer', async () => {
    const game = await planned();
    for (const [index, round] of plan.entries()) {
      await game.instructor.must('openYear', { year: index + 1 });
      expect((game.instructor.view['timing'] as { seconds: number }).seconds).toBe(round.seconds);
      await game.instructor.must('closeYear');
    }
  });

  it('turns messaging on for a messaging round and off when it closes', async () => {
    const game = await planned();
    await game.instructor.must('openYear', { year: 1 });
    await game.sync();

    const sent = await game.world(2)['B']?.send('sendMessage', { text: 'Shall we keep it low?' });
    expect(sent?.ok).toBe(true);
    expect(Object.keys(state(game).messaging)).toHaveLength(2);

    await game.instructor.must('closeYear');
    expect(state(game).messaging).toEqual({});

    await game.instructor.must('openYear', { year: 2 });
    await game.sync();
    const refused = await game.world(1)['A']?.send('sendMessage', { text: 'Anyone there?' });
    expect(refused?.ok).toBe(false);
  });

  it('tells terminals and the projector when face-to-face talks are on', async () => {
    const game = await planned();
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await game.instructor.must('openYear', { year: 1 });
    await game.sync();
    expect(game.teams[0]?.view['faceToFace']).toBe(false);

    await game.instructor.must('closeYear');
    await game.instructor.must('openYear', { year: 2 });
    await game.sync();
    expect(game.teams[0]?.view['faceToFace']).toBe(true);
    const view = await projector.waitForView((v) => v['year'] === 2, 'year 2 on the projector');
    expect(view['faceToFace']).toBe(true);
    expect((game.instructor.view['round'] as RoundPlan).faceToFace).toBe(true);
  });

  it('shows every world total on the projector only in the rounds that allow it', async () => {
    const game = await planned();
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await game.instructor.must('openYear', { year: 1 });
    await game.instructor.must('closeYear');
    let view = await projector.waitForView(
      (v) => v['phase'] === 'YEAR_REVEAL' && v['year'] === 1,
      'year 1 results',
    );
    expect(view['showsPrices']).toBe(false);
    for (const world of view['worlds'] as Array<{ priceCents: unknown; rows: unknown[] }>) {
      expect(world.priceCents).toBeNull();
      expect(world.rows).toEqual([]);
    }

    await game.instructor.must('openYear', { year: 2 });
    await game.instructor.must('closeYear');
    view = await projector.waitForView(
      (v) => v['phase'] === 'YEAR_REVEAL' && v['year'] === 2,
      'year 2 results',
    );
    expect(view['showsPrices']).toBe(true);
    for (const world of view['worlds'] as Array<{ priceCents: unknown; rows: unknown[] }>) {
      expect(world.priceCents).not.toBeNull();
      expect(world.rows.length).toBeGreaterThan(0);
    }
  });

  it('refuses a plan whose length does not match the number of years', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, years: 3, ...SHORT } });
    const ack = await game.instructor.send('updateSettings', {
      settings: { rounds: plan.slice(0, 2) },
    });
    expect(ack.ok).toBe(false);
    expect(ack.ok ? '' : ack.message).toContain('round plan');
  });
});
