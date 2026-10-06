/**
 * Who is allowed to send what (SPEC section 7 and section 9).
 *
 * The rule is simple and the test is dull on purpose: a team screen can never
 * run an instructor command, the projector can never run anything at all, and a
 * wrong key gets nowhere.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameClient } from '../support/client.js';
import { openGame, startPractice } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('a team screen', () => {
  it('cannot run any instructor command', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    const team = game.teams[0];

    const attempts = [
      await team?.send('closeYear'),
      await team?.send('openYear', { year: 1 }),
      await team?.send('pause'),
      await team?.send('extend', { seconds: 30 }),
      await team?.send('announce', { text: 'Everyone stop.' }),
      await team?.send('muteTeam', { teamId: game.teams[1]?.teamId ?? '' }),
      await team?.send('endGame'),
      await team?.send('revealResultsToTeams'),
      await team?.send('deleteSession', { confirm: 'DELETE' }),
      await team?.send('updateSettings', { settings: { capacity: 1000 } }),
    ];

    for (const ack of attempts) {
      expect(ack?.ok).toBe(false);
      if (!ack || ack.ok) continue;
      expect(ack.code).toBe('NOT_ALLOWED');
      expect(ack.message).toMatch(/Only the instructor/);
    }
    expect(harness.server.store.get(game.session.sessionId)?.phase).toBe('PRACTICE_OPEN');
  });

  it('cannot act for another team', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    await game.teams[0]?.must('submitDecision', { tenths: 383 });

    // Each socket is bound to its own team, so there is no field to point at
    // someone else; the proof is that only its own decision exists.
    const state = harness.server.store.get(game.session.sessionId);
    expect(Object.keys(state?.worlds[0]?.open?.decisions ?? {})).toEqual(['A']);
  });
});

describe('the projector', () => {
  it('cannot run any command, not even a team one', async () => {
    const game = await openGame(harness);
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    const attempts = [
      await projector.send('closeYear'),
      await projector.send('sendMessage', { text: 'Hello' }),
      await projector.send('claimTeam', { joinCode: game.session.teams[0]?.joinCode ?? '' }),
    ];

    for (const ack of attempts) {
      expect(ack.ok).toBe(false);
      if (ack.ok) continue;
      expect(ack.code).toBe('NOT_ALLOWED');
    }
  });

  it('may still answer a network check', async () => {
    const game = await openGame(harness, { claimAll: false });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    const ack = await projector.send('ping');
    expect(ack.ok).toBe(true);
  });
});

describe('keys', () => {
  it('turns away a wrong instructor key', async () => {
    const game = await openGame(harness, { claimAll: false });
    const client = new GameClient(harness.url, 'impostor');
    harness.track(client);

    const result = await client.hello({
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: 'this-is-not-the-right-key-at-all',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not right for this session/);
  });

  it('turns away a wrong projector key', async () => {
    const game = await openGame(harness, { claimAll: false });
    const client = new GameClient(harness.url, 'impostor');
    harness.track(client);

    const result = await client.hello({
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: 'this-is-not-the-right-key-at-all',
    });

    expect(result.ok).toBe(false);
  });

  it('does not let the projector key open the dashboard', async () => {
    const game = await openGame(harness, { claimAll: false });
    const client = new GameClient(harness.url, 'projector-as-instructor');
    harness.track(client);

    const result = await client.hello({
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: game.session.projectorKey,
    });

    expect(result.ok).toBe(false);
  });

  it('refuses commands from a socket that never said hello', async () => {
    const game = await openGame(harness, { claimAll: false });
    const client = new GameClient(harness.url, 'silent');
    harness.track(client);
    await client.connect();

    const ack = await client.send('ping');

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NOT_ALLOWED');
    expect(game.session.sessionId).toBeTruthy();
  });

  it('refuses a session id that does not exist', async () => {
    const client = new GameClient(harness.url, 'lost');
    harness.track(client);

    const result = await client.hello({ role: 'team', sessionId: 'no-such-session' });

    expect(result.ok).toBe(false);
  });
});

describe('typed confirmations', () => {
  it('needs the word RESET to reset and DELETE to delete', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const badReset = await game.instructor.sendRaw({
      commandId: 'reset-wrong-word-1',
      type: 'resetSession',
      payload: { confirm: 'reset' },
    });
    const badDelete = await game.instructor.sendRaw({
      commandId: 'delete-wrong-word-1',
      type: 'deleteSession',
      payload: { confirm: 'yes' },
    });

    expect(badReset.ok).toBe(false);
    expect(badDelete.ok).toBe(false);
    expect(harness.server.store.get(game.session.sessionId)?.phase).toBe('PRACTICE_OPEN');
  });
});
