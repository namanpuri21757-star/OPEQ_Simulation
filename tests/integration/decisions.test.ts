/**
 * Submitting a decision: what is accepted, what is refused, and what happens
 * when the same thing is sent twice or by everyone at once (SPEC sections 4, 9).
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
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

describe('submitting a decision', () => {
  it('accepts a number inside capacity and lets the team change it', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);

    const team = game.teams[0];
    await team?.must('submitDecision', { tenths: 383 });
    await team?.must('submitDecision', { tenths: 400 });

    expect(team?.view['decision']).toMatchObject({ tenths: 400, auto: false });
    expect(team?.view['submitted']).toBe(true);
  });

  it('refuses more than capacity with a number a student can act on', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const ack = await game.teams[0]?.send('submitDecision', { tenths: 1000 });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('INVALID');
    expect(ack.message).toContain('75.0 million barrels');
  });

  it('refuses a number that is not a number at all', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const ack = await game.teams[0]?.sendRaw({
      commandId: nextCommandId(),
      type: 'submitDecision',
      payload: { tenths: 38.3 },
      expectedPhase: 'PRACTICE_OPEN',
      expectedYear: 0,
    });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('INVALID');
  });

  it('refuses a decision in the wrong phase', async () => {
    const game = await openGame(harness);

    const ack = await game.teams[0]?.send('submitDecision', { tenths: 383 });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('CLOSED');
  });

  it('refuses a decision sent for the wrong year', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);

    const ack = await game.teams[0]?.send(
      'submitDecision',
      { tenths: 383 },
      { expectedPhase: 'YEAR_OPEN', expectedYear: 2 },
    );

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('STALE');
    expect(ack.message).toMatch(/moved on/);
  });

  it('refuses a decision that arrives with no guards at all', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const ack = await game.teams[0]?.send('submitDecision', { tenths: 383 }, { noGuards: true });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('INVALID');
  });

  it('refuses a decision that arrives after the year closed', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    const team = game.teams[0];
    await team?.must('submitDecision', { tenths: 383 });
    await closeYear(game);
    await team?.waitForView((view) => view['phase'] === 'PRACTICE_REVEAL');

    const ack = await team?.send('submitDecision', { tenths: 500 });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('CLOSED');
  });
});

describe('the same commandId twice', () => {
  it('applies once when the two arrive one after the other', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    const team = game.teams[0];
    const id = nextCommandId('twice');

    const first = await team?.send('submitDecision', { tenths: 383 }, { commandId: id });
    const second = await team?.send('submitDecision', { tenths: 383 }, { commandId: id });

    expect(first?.ok).toBe(true);
    expect(second?.ok).toBe(true);
    expect(second?.ok && first?.ok && second.version).toBe(first?.ok ? first.version : -1);
    expect(countEvents(await eventsOf(harness, game.session.sessionId), 'submitDecision')).toBe(1);
  });

  it('applies once when the two arrive at the same moment', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    const team = game.teams[0];
    const id = nextCommandId('atonce');

    const [a, b] = await Promise.all([
      team?.send('submitDecision', { tenths: 383 }, { commandId: id }),
      team?.send('submitDecision', { tenths: 383 }, { commandId: id }),
    ]);

    expect(a?.ok).toBe(true);
    expect(b?.ok).toBe(true);
    expect(countEvents(await eventsOf(harness, game.session.sessionId), 'submitDecision')).toBe(1);
  });
});

describe('everyone submitting at once', () => {
  it('gives each of nine teams exactly one decision, twenty times over', async () => {
    const game = await openGame(harness, { settings: { worlds: 3 } });
    expect(game.teams).toHaveLength(9);
    await startPractice(game);

    for (let round = 0; round < 20; round += 1) {
      await Promise.all(
        game.teams.map((team, index) =>
          team.send('submitDecision', { tenths: 300 + round * 10 + index }),
        ),
      );
    }

    // Views are sent at most ten times a second, so the last one may still be
    // on its way. Waiting for it is part of what is being checked.
    await Promise.all(
      game.teams.map((team, index) =>
        team.waitForView(
          (view) => (view['decision'] as { tenths: number } | null)?.tenths === 490 + index,
          `${team.name} to show its last number`,
        ),
      ),
    );

    const state = harness.server.store.get(game.session.sessionId);
    expect(state).toBeDefined();
    for (const world of state?.worlds ?? []) {
      const open = world.open;
      expect(open).not.toBeNull();
      expect(Object.keys(open?.decisions ?? {}).sort()).toEqual(['A', 'B', 'C']);
    }
    expect(countEvents(await eventsOf(harness, game.session.sessionId), 'submitDecision')).toBe(
      180,
    );
  });
});

describe('missing decisions', () => {
  it('uses the starting output in practice and in Year 1', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await game.teams[0]?.must('submitDecision', { tenths: 500 });
    await closeYear(game);

    const state = harness.server.store.get(game.session.sessionId);
    const practice = state?.worlds[0]?.practice;
    expect(practice?.decisions.B).toMatchObject({ tenths: 400, auto: true, source: 'auto' });
    expect(practice?.decisions.A).toMatchObject({ tenths: 500, auto: false });

    await openYear(game, 1);
    await closeYear(game);
    const year1 = harness.server.store.get(game.session.sessionId)?.worlds[0]?.years[0];
    for (const letter of COUNTRY_LETTERS) {
      expect(year1?.decisions[letter]).toMatchObject({ tenths: 400, auto: true });
    }
  });

  it('repeats last years target from Year 2 on', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    await submitAll(game, 550);
    await closeYear(game);

    await openYear(game, 2);
    await closeYear(game);

    const year2 = harness.server.store.get(game.session.sessionId)?.worlds[0]?.years[1];
    for (const letter of COUNTRY_LETTERS) {
      expect(year2?.decisions[letter]).toMatchObject({ tenths: 550, auto: true });
    }
  });

  it('closes by itself when autoClose is on and everyone has submitted', async () => {
    const game = await openGame(harness, { settings: { worlds: 2, autoClose: true } });
    await startPractice(game);

    await submitAll(game, 383);

    await game.instructor.waitForView(
      (view) => view['phase'] === 'PRACTICE_REVEAL',
      'the year to close itself',
    );
    expect(countEvents(await eventsOf(harness, game.session.sessionId), 'closeYear')).toBe(1);
  });
});

async function eventsOf(harness: Harness, sessionId: string): Promise<string[]> {
  const raw = await readFile(join(harness.dataDir, 'sessions', sessionId, 'events.jsonl'), 'utf8');
  return raw.split('\n').filter((line) => line.trim() !== '');
}

function countEvents(lines: string[], type: string): number {
  return lines.filter((line) => {
    const parsed = JSON.parse(line) as { command?: { type?: string } };
    return parsed.command?.type === type;
  }).length;
}
