/**
 * One terminal per team, and what happens when a second one wants in
 * (SPEC section 9).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameClient } from '../support/client.js';
import { startServer, type Harness } from '../support/harness.js';
import { openGame, waitConnected } from '../support/game.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('claiming a team', () => {
  it('takes the country the code belongs to', async () => {
    const game = await openGame(harness, { claimAll: false });
    const first = game.session.teams[0];
    expect(first).toBeDefined();

    const terminal = await harness.client('t1', {
      role: 'team',
      sessionId: game.session.sessionId,
    });
    const ack = await terminal.send('claimTeam', { joinCode: first?.joinCode ?? '' });

    expect(ack.ok).toBe(true);
    const result = ack.ok
      ? (ack.result as { teamId: string; label: string; tookOver: boolean })
      : null;
    expect(result?.teamId).toBe(first?.teamId);
    expect(result?.tookOver).toBe(false);
    expect(result?.label).toContain('Ardonia');
  });

  it('says so kindly when the code is wrong', async () => {
    const game = await openGame(harness, { claimAll: false });
    const terminal = await harness.client('t1', {
      role: 'team',
      sessionId: game.session.sessionId,
    });

    const ack = await terminal.send('claimTeam', { joinCode: 'ZZZZZZ' });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NOT_FOUND');
    expect(ack.message).toMatch(/card on your table/);
  });

  it('needs the instructor when the other terminal is still connected', async () => {
    const game = await openGame(harness);
    const code = game.session.teams[0]?.joinCode ?? '';

    const second = await harness.client('t2', { role: 'team', sessionId: game.session.sessionId });
    const ack = await second.send('claimTeam', { joinCode: code });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NEEDS_APPROVAL');

    // The dashboard shows the request.
    await game.instructor.waitForView((view) => {
      const teams = view['teams'] as Array<{ teamId: string; pendingTakeover: boolean }>;
      return teams.some((team) => team.pendingTakeover);
    }, 'the takeover request to appear');
  });

  it('moves the team when the instructor approves', async () => {
    const game = await openGame(harness);
    const first = game.teams[0];
    const teamId = first?.teamId ?? '';
    const code = game.session.teams[0]?.joinCode ?? '';

    const second = await harness.client('t2', { role: 'team', sessionId: game.session.sessionId });
    await second.send('claimTeam', { joinCode: code });

    await game.instructor.must('approveTakeover', { teamId });

    await second.waitUntil(() => second.claimed.length > 0, 'the new terminal to be let in');
    expect(second.claimed[0]?.teamId).toBe(teamId);
    expect(first?.gone.map((g) => g.reason)).toContain('takenOver');
  });

  it('leaves the team where it is when the instructor says no', async () => {
    const game = await openGame(harness);
    const teamId = game.teams[0]?.teamId ?? '';
    const code = game.session.teams[0]?.joinCode ?? '';

    const second = await harness.client('t2', { role: 'team', sessionId: game.session.sessionId });
    await second.send('claimTeam', { joinCode: code });
    await game.instructor.must('denyTakeover', { teamId });

    await second.waitUntil(() => second.gone.length > 0, 'the refusal');
    expect(second.gone[0]?.reason).toBe('denied');
    expect(second.claimed).toHaveLength(0);
  });

  it('allows a takeover once the other terminal has been gone 15 seconds', async () => {
    const game = await openGame(harness);
    const teamId = game.teams[0]?.teamId ?? '';
    const code = game.session.teams[0]?.joinCode ?? '';

    game.teams[0]?.disconnect();
    await waitConnected(game.instructor, teamId, false);

    // 14 seconds is not enough.
    harness.clock.advance(14000);
    const tooSoon = await harness
      .client('t2', { role: 'team', sessionId: game.session.sessionId })
      .then((client) => client.send('claimTeam', { joinCode: code }));
    expect(tooSoon.ok).toBe(false);

    // One more second is.
    harness.clock.advance(2000);
    const third = await harness.client('t3', { role: 'team', sessionId: game.session.sessionId });
    const ack = await third.send('claimTeam', { joinCode: code });

    expect(ack.ok).toBe(true);
    const result = ack.ok ? (ack.result as { tookOver: boolean }) : null;
    expect(result?.tookOver).toBe(true);
  });

  it('frees a team when the instructor releases the terminal', async () => {
    const game = await openGame(harness);
    const first = game.teams[0];
    const teamId = first?.teamId ?? '';
    const code = game.session.teams[0]?.joinCode ?? '';

    await game.instructor.must('releaseTerminal', { teamId });
    await first?.waitUntil(() => first.gone.length > 0, 'the release message');
    expect(first?.gone[0]?.reason).toBe('released');

    const replacement = new GameClient(harness.url, 't2');
    harness.track(replacement);
    await replacement.hello({ role: 'team', sessionId: game.session.sessionId });
    const ack = await replacement.send('claimTeam', { joinCode: code });
    expect(ack.ok).toBe(true);
  });

  it('lets a terminal come back with its saved token', async () => {
    const game = await openGame(harness);
    const first = game.teams[0];
    const token = first?.token ?? '';
    first?.disconnect();

    const again = new GameClient(harness.url, 't1-again');
    harness.track(again);
    const result = await again.hello({
      role: 'team',
      sessionId: game.session.sessionId,
      teamToken: token,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.teamId).toBe(first?.teamId);
    expect(result.needsClaim).toBe(false);
  });

  it('asks an unknown token to claim again rather than guessing', async () => {
    const game = await openGame(harness, { claimAll: false });
    const client = new GameClient(harness.url, 'stranger');
    harness.track(client);

    const result = await client.hello({
      role: 'team',
      sessionId: game.session.sessionId,
      teamToken: 'a-token-that-was-never-issued',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.needsClaim).toBe(true);
    expect(result.teamId).toBeNull();
  });
});
