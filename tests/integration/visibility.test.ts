/**
 * Who sees what (SPEC section 7).
 *
 * This is the test that matters most: it plays a whole game, keeps every single
 * payload every team was ever sent, and then searches all of it for anything
 * that belongs to someone else. A leak anywhere in any view fails here.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { GameClient } from '../support/client.js';
import {
  closeYear,
  endBetween,
  openGame,
  openYear,
  startBetween,
  startPractice,
  submitAll,
  type OpenGame,
} from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** Plays three worlds through practice, two years and a chat window. */
async function playSomeGame(options: { disclosure?: 'full' | 'totalOnly' | 'priceOnly' } = {}) {
  const game = await openGame(harness, {
    settings: {
      worlds: 3,
      ...(options.disclosure ? { disclosure: options.disclosure } : {}),
    },
  });

  await startPractice(game);
  await submitAll(game, 383);
  await closeYear(game);

  await openYear(game, 1);
  for (const [index, team] of game.teams.entries()) {
    await team.must('recordHuddle', {
      suggestions: [{ name: `Ada${String(index)}`, tenths: 383 }],
      reason: `secret-huddle-${String(index)}`,
    });
    await team.must('submitDecision', { tenths: 380 + index });
    await team.must('submitPrediction', { othersTenths: [383, 383], trust: 3 });
  }
  await closeYear(game);

  await startBetween(game, 'chat');
  for (const [index, team] of game.teams.entries()) {
    await team.must('sendMessage', { text: `secret-message-${String(index)}` });
  }
  await endBetween(game);

  await openYear(game, 2);
  await submitAll(game, 400);
  await closeYear(game);

  return game;
}

/** Every string that belongs to somebody other than this team. */
function forbiddenFor(game: OpenGame, team: GameClient): string[] {
  const state = harness.server.store.get(game.session.sessionId);
  if (!state) throw new Error('no state');
  const me = state.teams[team.teamId ?? ''];
  if (!me) throw new Error('no team');

  const out: string[] = [state.instructorKey, state.projectorKey];

  for (const world of state.worlds) {
    if (world.worldId === me.worldId) continue;
    out.push(world.worldId);
    for (const letter of COUNTRY_LETTERS) out.push(`${world.worldId}-${letter}`);
  }
  for (const other of Object.values(state.teams)) {
    if (other.teamId === me.teamId) continue;
    out.push(other.joinCode);
    if (other.token) out.push(other.token);
    // Another world's private writing. Same-world chat is shared on purpose.
    if (other.worldId !== me.worldId) {
      for (const huddle of Object.values(other.huddles)) out.push(huddle.reason);
    }
  }
  for (const message of state.messages) {
    if (message.worldId !== null && message.worldId !== me.worldId) out.push(message.text);
  }
  // A team's own token is fine; nobody else's huddle text is.
  for (const other of Object.values(state.teams)) {
    if (other.teamId === me.teamId || other.worldId !== me.worldId) continue;
    for (const huddle of Object.values(other.huddles)) out.push(huddle.reason);
  }
  return [...new Set(out)].filter((needle) => needle.length >= 4);
}

describe('what a team is sent', () => {
  it('never contains another world, another team s private writing, or a key', async () => {
    const game = await playSomeGame();

    for (const team of game.teams) {
      const haystack = JSON.stringify(team.views);
      for (const needle of forbiddenFor(game, team)) {
        expect(haystack, `${team.name} was sent "${needle}"`).not.toContain(needle);
      }
    }
  });

  it('keeps its own huddle, prediction and reflection and no one else s', async () => {
    const game = await playSomeGame();
    const mine = game.teams[0];
    const theirs = game.teams[1];

    expect(JSON.stringify(mine?.views)).toContain('secret-huddle-0');
    expect(JSON.stringify(mine?.views)).not.toContain('secret-huddle-1');
    expect(JSON.stringify(theirs?.views)).toContain('secret-huddle-1');
    expect(JSON.stringify(theirs?.views)).not.toContain('secret-huddle-0');
  });

  it('shows every country s output under full disclosure', async () => {
    const game = await playSomeGame();
    const reveal = game.teams[0]?.view['reveal'] as {
      totalTenths: number | null;
      countries: Array<{ letter: string; actualTenths: number | null }>;
    };

    expect(reveal.totalTenths).toBe(1200);
    for (const country of reveal.countries) expect(country.actualTenths).not.toBeNull();
  });

  it('hides other countries under totalOnly but keeps the world total', async () => {
    const game = await playSomeGame({ disclosure: 'totalOnly' });
    const reveal = game.teams[0]?.view['reveal'] as {
      totalTenths: number | null;
      newProducerTenths: number | null;
      countries: Array<{ letter: string; actualTenths: number | null; profitK: number | null }>;
    };

    expect(reveal.totalTenths).toBe(1200);
    const own = reveal.countries.find((row) => row.letter === 'A');
    expect(own?.actualTenths).toBe(400);
    expect(own?.profitK).not.toBeNull();
    for (const country of reveal.countries.filter((row) => row.letter !== 'A')) {
      expect(country.actualTenths).toBeNull();
      expect(country.profitK).toBeNull();
    }
    // The history table hides them too, not only the reveal.
    const history = game.teams[0]?.view['history'] as Array<{ others: unknown | null }>;
    for (const row of history) expect(row.others).toBeNull();
  });

  it('hides the world total too under priceOnly, and gives no reason', async () => {
    const game = await playSomeGame({ disclosure: 'priceOnly' });
    const reveal = game.teams[0]?.view['reveal'] as {
      totalTenths: number | null;
      priceCents: number;
      sentence: string;
      countries: Array<{ letter: string; actualTenths: number | null }>;
    };

    expect(reveal.priceCents).toBeGreaterThan(0);
    expect(reveal.totalTenths).toBeNull();
    expect(reveal.sentence).not.toMatch(/because/);
    const history = game.teams[0]?.view['history'] as Array<{ totalTenths: number | null }>;
    for (const row of history) expect(row.totalTenths).toBeNull();
  });

  it('only opens other worlds once the instructor releases the results', async () => {
    const game = await playSomeGame();
    expect(game.teams[0]?.view['leaderboard']).toBeNull();

    await game.instructor.must('endGame');
    await game.instructor.must('revealResultsToTeams');
    await game.sync();

    const leaderboard = game.teams[0]?.view['leaderboard'] as {
      countries: Array<{ worldNumber: number; letter: string }>;
      worlds: Array<{ worldNumber: number }>;
    };
    expect(leaderboard.countries).toHaveLength(9);
    expect(leaderboard.worlds).toHaveLength(3);
    // Worlds are named by their number, never by the id the server uses.
    expect(JSON.stringify(leaderboard)).not.toContain('world-2');
  });
});

describe('what the projector is sent', () => {
  it('has no chat, no team-private data and no keys', async () => {
    const game = await playSomeGame();
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    await game.instructor.must('announce', { text: 'Well done.' });
    await projector.waitForView(
      (view) => (view['announcements'] as unknown[]).length > 0,
      'the announcement',
    );

    const haystack = JSON.stringify(projector.views);
    const state = harness.server.store.get(game.session.sessionId);

    expect(haystack).not.toContain(state?.instructorKey ?? '');
    expect(haystack).not.toContain(state?.projectorKey ?? '');
    for (let i = 0; i < 9; i += 1) {
      expect(haystack).not.toContain(`secret-message-${String(i)}`);
      expect(haystack).not.toContain(`secret-huddle-${String(i)}`);
    }
    for (const team of Object.values(state?.teams ?? {})) {
      expect(haystack).not.toContain(team.joinCode);
      if (team.token) expect(haystack).not.toContain(team.token);
    }
  });

  it('shows a price per world only after a reveal, when that is turned on', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await startPractice(game);
    const open = await projector.waitForView(
      (view) => view['phase'] === 'PRACTICE_OPEN',
      'the open year',
    );
    expect((open['worlds'] as Array<{ priceCents: number | null }>)[0]?.priceCents).toBeNull();

    await submitAll(game, 383);
    await closeYear(game);
    const revealed = await projector.waitForView(
      (view) => view['phase'] === 'PRACTICE_REVEAL',
      'the reveal',
    );
    expect((revealed['worlds'] as Array<{ priceCents: number | null }>)[0]?.priceCents).toBe(3553);
  });

  it('shows no prices at all when projectorShowsPrices is off', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, projectorShowsPrices: false },
    });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);
    const view = await projector.waitForView((v) => v['phase'] === 'PRACTICE_REVEAL', 'the reveal');

    expect((view['worlds'] as Array<{ priceCents: number | null }>)[0]?.priceCents).toBeNull();
  });
});

describe('what the instructor is sent', () => {
  it('has everything, because that is the point of the dashboard', async () => {
    const game = await playSomeGame();
    const view = game.instructor.view;

    expect(view['instructorKey']).toBe(game.session.instructorKey);
    expect((view['teams'] as unknown[]).length).toBe(9);
    expect(JSON.stringify(view)).toContain('secret-huddle-0');
    expect(JSON.stringify(view)).toContain('secret-message-1');
    expect(view['benchmarks']).toMatchObject({ cooperativeShareTenths: 383 });
  });
});
