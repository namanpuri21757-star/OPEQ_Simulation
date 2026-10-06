/**
 * Surviving a restart (SPEC section 9).
 *
 * The promise to a teacher is that decisions are safe on the instructor
 * computer. These tests stop a server in the middle of a year, start a new one
 * on the same folder, and check that nothing was lost and nothing was invented.
 */

import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameClient } from '../support/client.js';
import { closeYear, openGame, openYear, startPractice, submitAll } from '../support/game.js';
import { startServer, TestClock, type Harness } from '../support/harness.js';

let harness: Harness;
let dataDir: string;

beforeEach(async () => {
  harness = await startServer();
  dataDir = harness.dataDir;
});

afterEach(async () => {
  await harness.cleanup();
});

/** Plays to the middle of Year 4 with decisions in, then stops the server. */
async function toMiddleOfYearFour() {
  const game = await openGame(harness, { settings: { worlds: 2 } });
  await startPractice(game);
  await submitAll(game, 383);
  await closeYear(game);
  for (const year of [1, 2, 3]) {
    await openYear(game, year);
    await submitAll(game, 400 + year);
    await closeYear(game);
  }
  await openYear(game, 4);
  await submitAll(game, 450);

  const before = harness.server.store.get(game.session.sessionId);
  const snapshot = {
    sessionId: game.session.sessionId,
    instructorKey: game.session.instructorKey,
    version: before?.version ?? 0,
    teamTokens: game.teams.map((team) => team.token ?? ''),
    teamIds: game.teams.map((team) => team.teamId ?? ''),
  };
  return { game, snapshot };
}

/** The saved state the next server would load, without changing the folder. */
async function restart(options: { clockAt?: number } = {}): Promise<Harness> {
  // Stop without removing the folder. No snapshot is written for an open year,
  // so the second server has to rebuild it from events.jsonl.
  await harness.stop();
  const next = await startServer({
    dataDir,
    clock: new TestClock(options.clockAt ?? 1_700_000_500_000),
  });
  harness = next;
  return next;
}

describe('after a restart', () => {
  it('comes back on the same year, paused, with every decision kept', async () => {
    const { snapshot } = await toMiddleOfYearFour();

    const next = await restart();
    const state = next.server.store.get(snapshot.sessionId);

    expect(state).toBeDefined();
    expect(state?.phase).toBe('YEAR_OPEN');
    expect(state?.year).toBe(4);
    expect(state?.timer.paused).toBe(true);
    expect(state?.timer.remainingMs).toBeGreaterThan(0);
    expect(state?.timer.deadline).toBeNull();
    // Three scored years settled, plus the practice year on its own.
    expect(state?.worlds[0]?.years).toHaveLength(3);
    expect(state?.worlds[0]?.practice).not.toBeNull();
    expect(state?.worlds[0]?.open?.decisions.A).toMatchObject({ tenths: 450 });
    expect(state?.worlds[1]?.open?.decisions.C).toMatchObject({ tenths: 450 });
  });

  it('carries on counting versions rather than starting again', async () => {
    const { snapshot } = await toMiddleOfYearFour();

    const next = await restart();
    const state = next.server.store.get(snapshot.sessionId);

    expect(state?.version).toBe(snapshot.version);

    const instructor = await next.client('instructor', {
      role: 'instructor',
      sessionId: snapshot.sessionId,
      instructorKey: snapshot.instructorKey,
    });
    const ack = await instructor.send('extend', { seconds: 30 });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.version).toBe(snapshot.version + 1);
  });

  it('lets every terminal come back with its saved token', async () => {
    const { snapshot } = await toMiddleOfYearFour();
    const next = await restart();

    for (const [index, token] of snapshot.teamTokens.entries()) {
      const client = new GameClient(next.url, `back-${String(index)}`);
      next.track(client);
      const result = await client.hello({
        role: 'team',
        sessionId: snapshot.sessionId,
        teamToken: token,
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.teamId).toBe(snapshot.teamIds[index]);
      const view = await client.waitForView((v) => v['phase'] === 'YEAR_OPEN', 'the year');
      expect(view['decision']).toMatchObject({ tenths: 450 });
    }
  });

  it('replays to exactly the same numbers, because events carry their own time', async () => {
    const { snapshot } = await toMiddleOfYearFour();
    const before = harness.server.store.get(snapshot.sessionId);
    const beforeYears = JSON.stringify(before?.worlds.map((world) => world.years));

    // A clock far in the future must make no difference at all.
    const next = await restart({ clockAt: 1_900_000_000_000 });
    const after = next.server.store.get(snapshot.sessionId);

    expect(JSON.stringify(after?.worlds.map((world) => world.years))).toBe(beforeYears);
    expect(after?.seed).toBe(before?.seed);
  });

  it('skips a half-written last line and says so', async () => {
    const { snapshot } = await toMiddleOfYearFour();
    await harness.stop();

    const path = join(dataDir, 'sessions', snapshot.sessionId, 'events.jsonl');
    const lines = (await readFile(path, 'utf8')).split('\n').filter((line) => line !== '');
    const lastGood = lines.length;
    // A power cut in the middle of writing the next command.
    await appendFile(path, '{"seq":999,"at":1700000000000,"command":{"type":"sub');

    const next = await startServer({ dataDir, clock: new TestClock(1_700_000_500_000) });
    harness = next;

    const state = next.server.store.get(snapshot.sessionId);
    expect(state).toBeDefined();
    expect(state?.seq).toBe(lastGood);
    expect(state?.worlds[0]?.open?.decisions.A).toMatchObject({ tenths: 450 });
    expect(next.warnings.join('\n')).toMatch(/not written completely/);
  });

  it('rebuilds from the events when the snapshot itself is unreadable', async () => {
    const { snapshot } = await toMiddleOfYearFour();
    await harness.stop();

    await writeFile(
      join(dataDir, 'sessions', snapshot.sessionId, 'snapshot.json'),
      '{ this is not json',
      'utf8',
    );

    const next = await startServer({ dataDir, clock: new TestClock(1_700_000_500_000) });
    harness = next;

    const state = next.server.store.get(snapshot.sessionId);
    expect(state?.year).toBe(4);
    expect(state?.worlds[0]?.open?.decisions.A).toMatchObject({ tenths: 450 });
    expect(next.warnings.join('\n')).toMatch(/No usable snapshot/);
  });

  it('writes a snapshot at every phase change', async () => {
    const game = await openGame(harness);
    await startPractice(game);

    const raw = await readFile(
      join(dataDir, 'sessions', game.session.sessionId, 'snapshot.json'),
      'utf8',
    );
    const saved = JSON.parse(raw) as { phase: string };
    expect(saved.phase).toBe('PRACTICE_OPEN');
  });
});

describe('deleting and resetting', () => {
  it('removes everything on delete and tells the screens', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    const sessionId = game.session.sessionId;

    await game.instructor.send('deleteSession', { confirm: 'DELETE' });

    await game.teams[0]?.waitUntil(() => (game.teams[0]?.gone.length ?? 0) > 0, 'the goodbye');
    expect(game.teams[0]?.gone[0]?.reason).toBe('deleted');
    expect(harness.server.store.get(sessionId)).toBeUndefined();
    await expect(
      readFile(join(dataDir, 'sessions', sessionId, 'events.jsonl'), 'utf8'),
    ).rejects.toThrow();
  });

  it('clears the play on reset but keeps the teams and their codes', async () => {
    const game = await openGame(harness);
    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);
    const codeBefore = harness.server.store.get(game.session.sessionId)?.teams['world-1-A']
      ?.joinCode;

    await game.instructor.must('resetSession', { confirm: 'RESET' });

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.phase).toBe('LOBBY');
    expect(state?.year).toBe(0);
    expect(state?.worlds[0]?.practice).toBeNull();
    expect(state?.worlds[0]?.years).toHaveLength(0);
    expect(state?.teams['world-1-A']?.joinCode).toBe(codeBefore);
    expect(state?.teams['world-1-A']?.claimed).toBe(true);
  });
});
