/**
 * Messaging: the one switch that decides whether a world can talk, and the
 * limits around a message (SPEC section 6 and 8.4).
 *
 * v2 replaced three things with one. There is no chat mode, no scheduled chat
 * phase and no structured pledge: a world can write exactly when its messaging
 * window is open, and the teacher is the only one who opens it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextCommandId } from '../support/client.js';
import {
  closeYear,
  messagingOff,
  messagingOn,
  openGame,
  openYear,
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
  text: string;
  letter: string;
  countryName: string;
}

const messages = (view: Record<string, unknown>): MessageRow[] =>
  (view['messages'] as MessageRow[] | undefined) ?? [];

const messaging = (view: Record<string, unknown>) =>
  view['messaging'] as { on: boolean; until: number | null } | undefined;

/** Plays the practice year and Year 1, so the game sits between years. */
async function toBetweenYears(where: Harness, worlds = 1) {
  // A messaging window scheduled after Year 1, so the plan has a step to offer
  // the moment the first year closes.
  const game = await openGame(where, {
    settings: { worlds, schedule: [{ afterYear: 1, kind: 'chat', seconds: 240 }] },
  });
  await startPractice(game);
  await closeYear(game);
  await openYear(game, 1);
  await submitAll(game, 383);
  await closeYear(game);
  return game;
}

describe('the messaging switch', () => {
  it('is off to begin with, so a message is refused', async () => {
    const game = await toBetweenYears(harness);

    const ack = await game.teams[0]?.send('sendMessage', { text: 'Hello everyone' });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('CLOSED');
    expect(ack.message).toMatch(/Messaging is off/);
  });

  it('refuses a message in a world whose switch is still off', async () => {
    const game = await toBetweenYears(harness, 2);
    await messagingOn(game, { worldIds: ['world-1'] });

    const inWorldOne = await game.world(1)['A']?.send('sendMessage', { text: 'We are talking.' });
    const inWorldTwo = await game.world(2)['A']?.send('sendMessage', { text: 'So are we.' });

    expect(inWorldOne?.ok).toBe(true);
    expect(inWorldTwo?.ok).toBe(false);
    if (!inWorldTwo || inWorldTwo.ok) return;
    expect(inWorldTwo.code).toBe('CLOSED');
  });

  it('switches every world at once when no world is named', async () => {
    const game = await toBetweenYears(harness, 2);
    await messagingOn(game);

    const one = await game.world(1)['A']?.send('sendMessage', { text: 'World one.' });
    const two = await game.world(2)['A']?.send('sendMessage', { text: 'World two.' });

    expect(one?.ok).toBe(true);
    expect(two?.ok).toBe(true);

    await messagingOff(game);
    const after = await game.world(1)['B']?.send('sendMessage', { text: 'Still here?' });
    expect(after?.ok).toBe(false);
  });

  it('turns itself off when its time runs out', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game, { seconds: 120 });

    const inTime = await game.teams[0]?.send('sendMessage', { text: 'In time.' });
    expect(inTime?.ok).toBe(true);

    harness.clock.advance(120_001);
    await harness.server.store.tick();
    await game.sync();

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.messaging).toEqual({});

    const late = await game.teams[0]?.send('sendMessage', { text: 'Too late.' });
    expect(late?.ok).toBe(false);
  });

  it('stays on until it is turned off when no time was given', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);

    harness.clock.advance(3_600_000);
    await harness.server.store.tick();

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.messaging['world-1']?.until).toBeNull();
  });

  it('tells every terminal and the projector what the state is', async () => {
    const game = await toBetweenYears(harness);
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    await projector.waitForView((view) => view['kind'] === 'projector', 'the first view');

    await messagingOn(game, { seconds: 180 });

    for (const team of game.teams) {
      const view = await team.waitForView((v) => messaging(v)?.on === true, 'messaging to be on');
      expect(messaging(view)?.until).toBeTypeOf('number');
    }
    const onProjector = await projector.waitForView(
      (view) => (view['messaging'] as { on: boolean } | undefined)?.on === true,
      'messaging on the projector',
    );
    expect((onProjector['messaging'] as { until: number | null }).until).toBeTypeOf('number');

    // The projector is told the state and never the messages themselves.
    await game.teams[0]?.must('sendMessage', { text: 'A secret plan.' });
    expect(JSON.stringify(projector.views)).not.toContain('A secret plan.');
  });

  it('tells the instructor the state of every world', async () => {
    const game = await toBetweenYears(harness, 2);
    await messagingOn(game, { worldIds: ['world-2'], seconds: 120 });

    const rows = game.instructor.view['messaging'] as Array<{
      worldNumber: number;
      on: boolean;
    }>;
    expect(rows.map((row) => [row.worldNumber, row.on])).toEqual([
      [1, false],
      [2, true],
    ]);
  });

  it('ends in the same state whether the plan step or the switch turned it on', async () => {
    const fromPlan = await toBetweenYears(harness);
    // After Year 1 the standard plan asks for a chat window, which now arrives
    // as the suggested setMessaging step. The dashboard sends its own payload.
    const suggested = fromPlan.instructor.view['suggested'] as {
      command: string;
      payload: { on: boolean; seconds?: number };
    };
    expect(suggested.command).toBe('setMessaging');
    await fromPlan.instructor.must('setMessaging', suggested.payload);
    await fromPlan.sync();
    const planned = harness.server.store.get(fromPlan.session.sessionId);
    const seconds = suggested.payload.seconds;

    const other = await startServer();
    try {
      const fromSwitch = await toBetweenYears(other);
      await fromSwitch.instructor.must('setMessaging', {
        on: true,
        ...(seconds === undefined ? {} : { seconds }),
      });
      await fromSwitch.sync();
      const switched = other.server.store.get(fromSwitch.session.sessionId);

      // The deadlines differ by whatever the two clocks say, so compare the
      // shape: which worlds are open, and whether each one has a deadline.
      const shape = (state: typeof switched) =>
        Object.entries(state?.messaging ?? {}).map(([worldId, window]) => [
          worldId,
          window.until === null ? 'open ended' : 'has a deadline',
        ]);
      expect(shape(switched)).toEqual(shape(planned));
      expect(switched?.activitiesDone).toEqual(planned?.activitiesDone);
    } finally {
      await other.cleanup();
    }
  });
});

describe('what a world may read', () => {
  it('lets a world talk, and only its own world hears it', async () => {
    const game = await toBetweenYears(harness, 2);
    await messagingOn(game);

    await game.world(1)['A']?.must('sendMessage', { text: 'Shall we all do 38.3?' });

    const inWorldOne = game.world(1);
    const inWorldTwo = game.world(2);
    await inWorldOne['B']?.waitForView((view) => messages(view).length > 0, 'the message');
    expect(messages(inWorldOne['B']?.view ?? {})[0]?.text).toBe('Shall we all do 38.3?');
    expect(messages(inWorldTwo['A']?.view ?? {})).toHaveLength(0);
  });

  it('says who wrote it by country, never by student name', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);

    await game.teams[1]?.must('sendMessage', { text: 'We agree.' });
    const view = await game.teams[0]?.waitForView((v) => messages(v).length > 0, 'the message');

    const message = messages(view ?? {})[0];
    expect(message).toMatchObject({ letter: 'B', countryName: 'Borvia' });
    expect(JSON.stringify(message)).not.toContain('Ada');
  });

  it('keeps the messages readable after messaging is turned off', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);
    await game.teams[0]?.must('sendMessage', { text: 'We will produce 38.3 million barrels.' });
    await messagingOff(game);

    const view = await game.teams[1]?.waitForView(
      (v) => messaging(v)?.on === false,
      'messaging to be off',
    );
    expect(messages(view ?? {})[0]?.text).toBe('We will produce 38.3 million barrels.');
  });
});

describe('the limits', () => {
  it('refuses a message longer than 280 characters', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);

    const ack = await game.teams[0]?.send('sendMessage', { text: 'x'.repeat(281) });

    expect(ack?.ok).toBe(false);
    if (!ack || ack.ok) return;
    expect(ack.code).toBe('INVALID');
  });

  it('asks a team to wait three seconds between messages', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);
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
    const game = await toBetweenYears(harness);
    await messagingOn(game);

    await game.teams[0]?.must('sendMessage', { text: 'That was a stupid idea' });
    const view = await game.teams[1]?.waitForView((v) => messages(v).length > 0, 'the message');

    expect(messages(view ?? {})[0]?.text).toBe('That was a ****** idea');
  });

  it('stops a muted team and lets it back in again', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);
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

  it('refuses to switch a world that is not part of this session', async () => {
    const game = await openGame(harness, { claimAll: false });

    const ack = await game.instructor.send('setMessaging', {
      on: true,
      worldIds: ['world-9'],
    });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('NOT_FOUND');
  });

  it('gives the same answer when a message is sent twice with one commandId', async () => {
    const game = await toBetweenYears(harness);
    await messagingOn(game);
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
