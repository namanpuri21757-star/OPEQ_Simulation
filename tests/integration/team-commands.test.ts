/**
 * The rest of what a terminal can do: names, the huddle, the prediction prompt,
 * and the network check (SPEC sections 5, 8.6).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeYear, openGame, openYear, startPractice } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('member names', () => {
  it('trims, filters and shows them back with the rotating roles', async () => {
    const game = await openGame(harness);

    await game.teams[0]?.must('setMembers', { names: ['  Ada ', 'Ben', 'stupid'] });

    expect(game.teams[0]?.view['members']).toEqual(['Ada', 'Ben', 'Member 3']);
    expect(game.teams[0]?.view['roles']).toMatchObject({
      operator: 'Ada',
      analysts: ['Ben'],
      envoy: 'Member 3',
    });
  });

  it('refuses more than four names', async () => {
    const game = await openGame(harness);

    const ack = await game.teams[0]?.send('setMembers', {
      names: ['A', 'B', 'C', 'D', 'E'],
    });

    expect(ack?.ok).toBe(false);
  });

  it('rotates the keyboard as the years go by', async () => {
    const game = await openGame(harness, { settings: { worlds: 1, rotateEvery: 1 } });
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    expect((game.teams[0]?.view['roles'] as { operator: string }).operator).toBe('Ada');

    await closeYear(game);
    await openYear(game, 2);
    expect((game.teams[0]?.view['roles'] as { operator: string }).operator).toBe('Ben');
  });
});

describe('the huddle and the prediction', () => {
  it('keeps the huddle for the team and the instructor only', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const ack = await game.teams[0]?.must('recordHuddle', {
      suggestions: [
        { name: 'Ada', tenths: 383 },
        { name: 'Ben', tenths: 400 },
      ],
      reason: 'Ada wanted to keep the price up.',
    });

    expect(game.teams[0]?.view['huddle']).toMatchObject({
      reason: 'Ada wanted to keep the price up.',
    });
    expect(game.teams[1]?.view['huddle']).toBeNull();

    // must() only waits for the team's own view. Views are deliberately capped
    // at ten a second (SPEC section 9), so the dashboard can still be one behind.
    const version = ack?.ok === true ? ack.version : 0;
    await game.instructor.waitForView(
      (view) => (view['version'] as number) >= version,
      'the dashboard to catch up',
    );
    const teams = game.instructor.view['teams'] as Array<{
      teamId: string;
      huddleRecorded: boolean;
    }>;
    expect(teams.find((team) => team.teamId === game.teams[0]?.teamId)?.huddleRecorded).toBe(true);
  });

  it('refuses a reason over 140 characters', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const ack = await game.teams[0]?.send('recordHuddle', {
      suggestions: [],
      reason: 'x'.repeat(141),
    });

    expect(ack?.ok).toBe(false);
  });

  it('asks for the decision before the guess', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const tooEarly = await game.teams[0]?.send('submitPrediction', {
      othersTenths: [383, 383],
      trust: 4,
    });
    expect(tooEarly?.ok).toBe(false);
    if (!tooEarly || tooEarly.ok) return;
    expect(tooEarly.message).toMatch(/Submit your own number first/);

    await game.teams[0]?.must('submitDecision', { tenths: 383 });
    await game.teams[0]?.must('submitPrediction', { othersTenths: [383, 400], trust: 4 });

    expect(game.teams[0]?.view['prediction']).toMatchObject({
      othersTenths: [383, 400],
      trust: 4,
    });
  });

  it('keeps a trust score inside 1 to 5', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await game.teams[0]?.must('submitDecision', { tenths: 383 });

    const ack = await game.teams[0]?.send('submitPrediction', {
      othersTenths: [383, 383],
      trust: 9,
    });

    expect(ack?.ok).toBe(false);
  });
});

describe('the network check', () => {
  it('answers a ping with the server time and never saves it', async () => {
    const game = await openGame(harness, { claimAll: false });
    const checker = await harness.client('check', {
      role: 'check',
      sessionId: game.session.sessionId,
    });
    const versionBefore = harness.server.store.get(game.session.sessionId)?.version;

    const ack = await checker.send('ping');

    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect((ack.result as { serverNow: number }).serverNow).toBe(harness.clock.now());
    expect(harness.server.store.get(game.session.sessionId)?.version).toBe(versionBefore);
  });

  it('puts a reported result on the dashboard', async () => {
    const game = await openGame(harness, { claimAll: false });
    const checker = await harness.client('check', {
      role: 'check',
      sessionId: game.session.sessionId,
    });

    await checker.must('report', { clientId: 'laptop-7', rttMs: 42, transport: 'websocket' });

    const view = await game.instructor.waitForView(
      (v) => Object.keys(v['networkChecks'] as object).length > 0,
      'the check to arrive',
    );
    expect((view['networkChecks'] as Record<string, unknown>)['laptop-7']).toMatchObject({
      rttMs: 42,
      transport: 'websocket',
    });
  });
});

describe('settings', () => {
  it('can be changed in the lobby and not afterwards', async () => {
    const game = await openGame(harness);

    await game.instructor.must('updateSettings', { settings: { capacity: 60, variancePct: 5 } });
    expect(harness.server.store.get(game.session.sessionId)?.settings.capacity).toBe(60);
    await game.sync();
    expect(game.teams[0]?.view['settings']).toMatchObject({ capacity: 60, capacityTenths: 600 });

    await startPractice(game);
    const tooLate = await game.instructor.send('updateSettings', { settings: { capacity: 70 } });

    expect(tooLate.ok).toBe(false);
    if (tooLate.ok) return;
    expect(tooLate.code).toBe('CLOSED');
    expect(harness.server.store.get(game.session.sessionId)?.settings.capacity).toBe(60);
  });

  it('refuses settings that do not make sense, and keeps the old ones', async () => {
    const game = await openGame(harness, { claimAll: false });

    const ack = await game.instructor.send('updateSettings', { settings: { a: 0.5 } });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('INVALID');
    expect(ack.message).toMatch(/more than the cost per barrel/);
    expect(harness.server.store.get(game.session.sessionId)?.settings.a).toBe(70);
  });

  it('keeps the join codes of teams that already exist when worlds are added', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const codeBefore = harness.server.store.get(game.session.sessionId)?.teams['world-1-A']
      ?.joinCode;

    await game.instructor.must('updateSettings', { settings: { worlds: 3 } });

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds).toHaveLength(3);
    expect(Object.keys(state?.teams ?? {})).toHaveLength(9);
    expect(state?.teams['world-1-A']?.joinCode).toBe(codeBefore);
    expect(state?.teams['world-3-C']?.joinCode).toBeTruthy();
  });
});
