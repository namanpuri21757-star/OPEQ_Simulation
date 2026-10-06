/**
 * Messages, pledges, announcements and the limits around them (SPEC section 6).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextCommandId } from '../support/client.js';
import {
  closeYear,
  endBetween,
  openGame,
  openYear,
  startBetween,
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

interface MessageRow {
  kind: string;
  text: string;
  letter: string | null;
  tenths?: number;
}

const messages = (view: Record<string, unknown>): MessageRow[] =>
  (view['messages'] as MessageRow[] | undefined) ?? [];

/** Plays Year 1 and opens a chat window after it. */
async function toChatWindow(harness: Harness, options: { chatMode?: 'off' | 'always' } = {}) {
  const game = await openGame(harness, {
    settings: {
      worlds: 1,
      ...(options.chatMode ? { chatMode: options.chatMode } : {}),
    },
  });
  await startPractice(game);
  await closeYear(game);
  await openYear(game, 1);
  await submitAll(game, 383);
  await closeYear(game);
  return game;
}

describe('the chat window', () => {
  it('refuses messages while the window is closed', async () => {
    const game = await toChatWindow(harness);

    const ack = await game.teams[0]?.send('sendMessage', { text: 'Hello everyone' });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('CLOSED');
    expect(ack.message).toMatch(/window is closed/);
  });

  it('lets a world talk during the window, and only its own world hears it', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    await submitAll(game, 383);
    await closeYear(game);
    await startBetween(game, 'chat');

    await game.teams[0]?.must('sendMessage', { text: 'Shall we all do 38.3?' });

    const inWorldOne = game.world(1);
    const inWorldTwo = game.world(2);
    await inWorldOne['B']?.waitForView((view) => messages(view).length > 0, 'the message');
    expect(messages(inWorldOne['B']?.view ?? {})[0]?.text).toBe('Shall we all do 38.3?');
    expect(messages(inWorldTwo['A']?.view ?? {})).toHaveLength(0);
  });

  it('says who wrote it by country, never by student name', async () => {
    const game = await toChatWindow(harness);
    await startBetween(game, 'chat');

    await game.teams[1]?.must('sendMessage', { text: 'We agree.' });
    const view = await game.teams[0]?.waitForView((v) => messages(v).length > 0, 'the message');

    const message = messages(view ?? {})[0];
    expect(message).toMatchObject({ letter: 'B', countryName: 'Borvia' });
    // The message itself names a country and nothing else about the group.
    expect(JSON.stringify(message)).not.toContain('Ada');
  });

  it('turns messages off completely when chatMode is off', async () => {
    const game = await toChatWindow(harness, { chatMode: 'off' });
    await startBetween(game, 'chat');

    const ack = await game.teams[0]?.send('sendMessage', { text: 'Anyone there?' });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.message).toMatch(/turned off/);
  });

  it('allows messages at any time when chatMode is always', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });

    const ack = await game.teams[0]?.send('sendMessage', { text: 'Early word.' });

    expect(ack?.ok).toBe(true);
  });
});

describe('the limits', () => {
  it('refuses a message longer than 280 characters', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });

    const ack = await game.teams[0]?.send('sendMessage', { text: 'x'.repeat(281) });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('INVALID');
  });

  it('asks a team to wait three seconds between messages', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });
    const team = game.teams[0];

    await team?.must('sendMessage', { text: 'First.' });
    const tooSoon = await team?.send('sendMessage', { text: 'Second.' });

    expect(tooSoon?.ok).toBe(false);
    if (!tooSoon || tooSoon.ok) return;
    expect(tooSoon.code).toBe('RATE_LIMITED');

    harness.clock.advance(3000);
    const later = await team?.send('sendMessage', { text: 'Third.' });
    expect(later?.ok).toBe(true);
  });

  it('masks a rude word rather than dropping the message', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });

    await game.teams[0]?.must('sendMessage', { text: 'That was a stupid idea' });
    const view = await game.teams[1]?.waitForView((v) => messages(v).length > 0, 'the message');

    expect(messages(view ?? {})[0]?.text).toBe('That was a ****** idea');
  });

  it('stops a muted team and lets it back in again', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });
    const teamId = game.teams[0]?.teamId ?? '';

    await game.instructor.must('muteTeam', { teamId });
    const muted = await game.teams[0]?.send('sendMessage', { text: 'Hello?' });

    expect(muted?.ok).toBe(false);
    if (!muted || muted.ok) return;
    expect(muted.code).toBe('MUTED');

    await game.instructor.must('unmuteTeam', { teamId });
    await game.teams[0]?.waitForView((view) => view['muted'] === false, 'the mute to lift');
    const after = await game.teams[0]?.send('sendMessage', { text: 'Hello again.' });
    expect(after?.ok).toBe(true);
  });
});

describe('pledges and announcements', () => {
  it('shows a pledge next to what the country actually produced', async () => {
    const game = await toChatWindow(harness);
    await startBetween(game, 'chat');
    await game.teams[0]?.must('sendPledge', { tenths: 383 });
    await endBetween(game);

    await openYear(game, 2);
    await game.teams[0]?.must('submitDecision', { tenths: 500 });
    await closeYear(game);

    const reveal = game.teams[0]?.view['reveal'] as {
      countries: Array<{
        letter: string;
        pledgeTenths: number | null;
        actualTenths: number | null;
      }>;
    };
    const ardonia = reveal.countries.find((row) => row.letter === 'A');
    expect(ardonia?.pledgeTenths).toBe(383);
    expect(ardonia?.actualTenths).toBe(500);
  });

  it('writes a pledge in plain words', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });

    await game.teams[0]?.must('sendPledge', { tenths: 383 });
    const view = await game.teams[1]?.waitForView((v) => messages(v).length > 0, 'the pledge');

    expect(messages(view ?? {})[0]).toMatchObject({
      kind: 'pledge',
      text: 'We will produce 38.3 million barrels.',
      tenths: 383,
    });
  });

  it('sends an announcement to every world, or to just one', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });

    await game.instructor.must('announce', { text: 'Five minutes left in the lesson.' });
    await game.instructor.must('announce', {
      text: 'World 1, please come to the front.',
      worldId: 'world-1',
    });

    const one = game.world(1)['A'];
    const two = game.world(2)['A'];
    await one?.waitForView((view) => messages(view).length === 2, 'both announcements');
    await two?.waitForView((view) => messages(view).length === 1, 'the shared announcement');

    expect(messages(two?.view ?? {})[0]?.text).toBe('Five minutes left in the lesson.');
    expect(messages(one?.view ?? {}).map((m) => m.kind)).toEqual(['announcement', 'announcement']);
  });

  it('keeps team chat off the projector', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await game.teams[0]?.must('sendMessage', { text: 'A secret plan.' });
    await game.instructor.must('announce', { text: 'Well done everyone.' });
    await projector.waitForView(
      (view) => (view['announcements'] as unknown[]).length > 0,
      'the announcement',
    );

    expect(JSON.stringify(projector.views)).not.toContain('A secret plan.');
    expect(JSON.stringify(projector.views)).toContain('Well done everyone.');
  });

  it('refuses an announcement to a world that is not in this session', async () => {
    const game = await openGame(harness, { claimAll: false });

    const ack = await game.instructor.send('announce', {
      text: 'Hello',
      worldId: 'world-9',
    });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NOT_FOUND');
  });

  it('gives the same answer when a message is sent twice with one commandId', async () => {
    const game = await toChatWindow(harness, { chatMode: 'always' });
    const id = nextCommandId('msg');

    await game.teams[0]?.send('sendMessage', { text: 'Only once.' }, { commandId: id });
    const repeat = await game.teams[0]?.send(
      'sendMessage',
      { text: 'Only once.' },
      { commandId: id },
    );

    expect(repeat?.ok).toBe(true);
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.messages.filter((m) => m.text === 'Only once.')).toHaveLength(1);
  });
});
