/**
 * D1 to D3 - the last ten seconds of a year.
 *
 * D1 a command the network swallowed, sent again, counts once.
 * D2 submit, change your mind, submit again: one record, the last number.
 * D3 a submission that arrives after the year closed is refused, kindly.
 *
 * D1 is tested through the real client connection rather than a bare socket,
 * because the retry is the client's behaviour: the outbox keeps anything
 * unanswered and sends it again with the same commandId after a reconnect.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Connection } from '../../src/client/net/connection.js';
import { memoryStore } from '../../src/client/net/storage.js';
import { readEvents, sessionDir } from '../../src/server/store/files.js';
import { PHASES } from '../../src/shared/state.js';
import { closeYear, openGame, openYear, startPractice } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** How many submitDecision commands were actually saved for this session. */
async function savedSubmits(sessionId: string): Promise<number> {
  const { events } = await readEvents(sessionDir(harness.dataDir, sessionId), () => undefined);
  return events.filter((event) => event.command.type === 'submitDecision').length;
}

describe('D1 - a retry after the network dropped', () => {
  it('counts a resent command once, and gives back the first answer', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');
    await startPractice(game);

    // A terminal's own connection, with its token, so the retry path is the
    // real one and not something the test invented.
    const store = memoryStore();
    const connection = new Connection({
      sessionId: game.session.sessionId,
      role: 'team',
      url: harness.url,
      store,
    });
    connection.remember({
      teamId: team.teamId ?? '',
      worldId: 'world-1',
      worldNumber: 1,
      letter: 'A',
      label: 'World 1 - A',
      token: team.token ?? '',
      tookOver: false,
    });
    connection.start();
    // Online is not enough: the guards on a decision come from the view, so the
    // screen has to have one before it can send anything - which is exactly
    // what a real terminal does too.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the terminal never got a view')), 10000);
      const ready = () => {
        const snapshot = connection.getSnapshot();
        const view = snapshot.view as { phase?: string } | null;
        return snapshot.status === 'online' && view?.phase === 'PRACTICE_OPEN';
      };
      const stop = connection.subscribe(() => {
        if (!ready()) return;
        clearTimeout(timer);
        stop();
        resolve();
      });
      if (ready()) {
        clearTimeout(timer);
        stop();
        resolve();
      }
    });
    // That connection took the team over from the test's own socket, because a
    // terminal with the right token is that terminal. Close the old one so the
    // two are not fighting over the same country.
    team.disconnect();

    const first = await connection.sendCommand('submitDecision', { tenths: 410 });
    expect(first.ok).toBe(true);
    expect(await savedSubmits(game.session.sessionId)).toBe(1);

    // The ack never arrived, so the screen sent it again with the same id -
    // three times, because a bad network does not stop at one.
    const id = 'd1-the-one-that-got-lost';
    const originals = await Promise.all([
      connection.sendCommand('submitDecision', { tenths: 377 }, { commandId: id }),
      connection.sendCommand('submitDecision', { tenths: 377 }, { commandId: id }),
      connection.sendCommand('submitDecision', { tenths: 377 }, { commandId: id }),
    ]);
    const again = await connection.sendCommand(
      'submitDecision',
      { tenths: 377 },
      { commandId: id },
    );

    for (const ack of [...originals, again]) expect(ack.ok).toBe(true);
    // Every answer is the one the server gave the first time.
    const versions = new Set([...originals, again].map((ack) => (ack.ok ? ack.version : -1)));
    expect(versions.size).toBe(1);

    expect(await savedSubmits(game.session.sessionId)).toBe(2);
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.open?.decisions['A']?.tenths).toBe(377);

    connection.stop();
  });
});

describe('D2 - submit, change, resubmit near the deadline', () => {
  it('keeps one record per country and the last number sent', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);

    // A group that keeps changing its mind as the clock runs down.
    for (const tenths of [383, 400, 350, 392, 388]) {
      const ack = await team.must('submitDecision', { tenths });
      expect(ack.ok).toBe(true);
    }

    await closeYear(game);
    await game.sync();

    const state = harness.server.store.get(game.session.sessionId);
    const record = state?.worlds[0]?.years.find((row) => row.year === 1);
    expect(record).toBeDefined();
    // One record for this country in this year, holding the last number.
    expect(record?.decisions['A'].tenths).toBe(388);
    expect(record?.decisions['A'].auto).toBe(false);
    expect(record?.decisions['A'].source).toBe('team');
    // And exactly one year 1 record, not one per change of mind.
    expect(state?.worlds[0]?.years.filter((row) => row.year === 1)).toHaveLength(1);

    // What the group is shown matches what was stored.
    const reveal = team.view['reveal'] as {
      countries: Array<{ letter: string; actualTenths: number | null }>;
    };
    expect(reveal.countries.find((row) => row.letter === 'A')?.actualTenths).toBe(388);
  });
});

describe('D3 - a submission after the year closed', () => {
  it('is refused with a message that says the last number was kept', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    await team.must('submitDecision', { tenths: 383 });
    await closeYear(game);
    await game.sync();

    // The group's own screen now says YEAR_REVEAL, so a click that was already
    // in flight carries the guards from the open year.
    const late = await team.send(
      'submitDecision',
      { tenths: 500 },
      {
        expectedPhase: 'YEAR_OPEN',
        expectedYear: 1,
      },
    );
    expect(late.ok).toBe(false);
    if (!late.ok) {
      expect(late.code).toBe('STALE');
      expect(late.message).toMatch(/moved on/);
      expect(late.message).toMatch(/nothing was changed/);
      // Written for a student to read: no phase names, no command names, no
      // codes and no blame (CLAUDE.md rule 8).
      for (const phase of PHASES) expect(late.message).not.toContain(phase);
      expect(late.message).not.toMatch(/undefined|Error|STALE|submitDecision/);
    }

    // A click sent with up-to-date guards is refused too, and says why.
    const alsoLate = await team.send('submitDecision', { tenths: 500 });
    expect(alsoLate.ok).toBe(false);
    if (!alsoLate.ok) {
      expect(alsoLate.code).toBe('CLOSED');
      expect(alsoLate.message).toBe('This year is closed. Your last number was kept.');
    }

    // Nothing moved, and neither refusal was written to the log: a command
    // that changed nothing is never saved, so a replay cannot apply it either.
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.worlds[0]?.years.find((row) => row.year === 1)?.decisions['A'].tenths).toBe(383);
    expect(await savedSubmits(game.session.sessionId)).toBe(1);
  });

  it('is refused the same way once the game has ended', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    await game.instructor.must('endGame');
    await game.sync();

    const ack = await team.send('submitDecision', { tenths: 400 });
    expect(ack.ok).toBe(false);
    if (!ack.ok) {
      expect(['CLOSED', 'STALE']).toContain(ack.code);
      expect(ack.message.length).toBeGreaterThan(10);
    }
  });
});
