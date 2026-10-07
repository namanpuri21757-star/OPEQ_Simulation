/**
 * C2 - nine groups press Submit in the same instant, twenty times over.
 *
 * This is the moment a classroom server either works or does not: a timer hits
 * ten seconds, every group that was still arguing presses at once, and nothing
 * may be lost, duplicated or attributed to the wrong country.
 *
 * Two things are measured: that each year holds exactly one decision per
 * country with the number that country actually sent, and how long an ack takes
 * when nine arrive together. The 300 ms figure is SPEC section 9's performance
 * requirement, read at the 95th percentile.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import { readEvents, sessionDir } from '../../src/server/store/files.js';
import { closeYear, openGame, openYear, startPractice } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

/** 95% of acks must come back faster than this (SPEC section 9). */
const ACK_BUDGET_MS = 300;
/** How many simultaneous rounds to play. */
const ROUNDS = 20;

let harness: Harness;

beforeEach(async () => {
  // A real tick, because this test is about real time.
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

describe('C2 - simultaneous submits', () => {
  it('stores every decision exactly once and answers 95% of them under 300 ms', async () => {
    const game = await openGame(harness, {
      // Long timers, so nothing closes itself while the rounds are running and
      // every round is a clean "all nine at once".
      settings: { worlds: 3, years: ROUNDS + 1, timers: { earlyYearSeconds: 600 } },
    });
    expect(game.teams).toHaveLength(9);

    // The practice year gets us out of the lobby and into the normal rhythm.
    await startPractice(game);
    await closeYear(game);

    const latencies: number[] = [];
    /** What each country sent, year by year, as the test knows it. */
    const sent = new Map<string, Map<number, number>>();

    for (let round = 1; round <= ROUNDS; round += 1) {
      await openYear(game, round);

      // Every number different, so a decision stored against the wrong country
      // or the wrong year cannot hide behind a matching value.
      const plan = game.teams.map((team, index) => ({
        team,
        tenths: 100 + round * 9 + index,
      }));

      const acks = await Promise.all(
        plan.map(async ({ team, tenths }) => {
          const at = Date.now();
          const ack = await team.send('submitDecision', { tenths });
          return { team, tenths, ack, ms: Date.now() - at };
        }),
      );

      for (const entry of acks) {
        expect(entry.ack.ok, `${entry.team.name}: ${JSON.stringify(entry.ack)}`).toBe(true);
        latencies.push(entry.ms);
        const byYear = sent.get(entry.team.teamId ?? '') ?? new Map<number, number>();
        byYear.set(round, entry.tenths);
        sent.set(entry.team.teamId ?? '', byYear);
      }

      await closeYear(game);
    }

    // --- every decision stored exactly once ---------------------------------

    const state = harness.server.store.get(game.session.sessionId);
    if (!state) throw new Error('the session went away');

    for (const world of state.worlds) {
      expect(world.years).toHaveLength(ROUNDS);
      const seen = new Set<number>();
      for (const record of world.years) {
        // One record per year, not two.
        expect(seen.has(record.year)).toBe(false);
        seen.add(record.year);
        for (const letter of COUNTRY_LETTERS) {
          const teamId = `${world.worldId}-${letter}`;
          const decision = record.decisions[letter];
          expect(decision, `${teamId} in year ${String(record.year)}`).toBeDefined();
          expect(decision.auto).toBe(false);
          expect(decision.source).toBe('team');
          expect(
            decision.tenths,
            `${teamId} in year ${String(record.year)} stored the wrong number`,
          ).toBe(sent.get(teamId)?.get(record.year));
        }
      }
    }

    // The saved log is the other half of "exactly once": one accepted
    // submitDecision per country per year, never two.
    const { events } = await readEvents(
      sessionDir(harness.dataDir, game.session.sessionId),
      () => undefined,
    );
    const submits = events.filter((event) => event.command.type === 'submitDecision');
    expect(submits).toHaveLength(ROUNDS * 9);
    expect(new Set(submits.map((event) => event.command.commandId)).size).toBe(ROUNDS * 9);

    // --- and fast enough ----------------------------------------------------

    const p95 = percentile(latencies, 0.95);
    expect(latencies).toHaveLength(ROUNDS * 9);
    expect(
      p95,
      `95th percentile ack was ${String(p95)} ms over ${String(latencies.length)} submits`,
    ).toBeLessThan(ACK_BUDGET_MS);
  });

  it('applies a repeated commandId once, however many times nine screens send it', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    await startPractice(game);
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    // The same id eight times at once: a tapped button, a flaky network, a
    // retry from the outbox, all at the same moment.
    const acks = await Promise.all(
      Array.from({ length: 8 }, () =>
        team.send('submitDecision', { tenths: 421 }, { commandId: 'c2-one-id-only-please' }),
      ),
    );

    for (const ack of acks) expect(ack.ok).toBe(true);
    // Every answer is the same answer: the first one.
    expect(new Set(acks.map((ack) => (ack.ok ? ack.version : -1))).size).toBe(1);

    const { events } = await readEvents(
      sessionDir(harness.dataDir, game.session.sessionId),
      () => undefined,
    );
    expect(events.filter((event) => event.command.type === 'submitDecision')).toHaveLength(1);
  });
});
