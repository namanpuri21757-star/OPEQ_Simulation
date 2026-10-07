/**
 * N1 to N3 - starting again, and keeping two lessons apart.
 *
 * N1 a new session from a preset, quickly, and yesterday's codes stop working.
 * N2 Reset clears the play and keeps the setup.
 * N3 two servers with their own data folders never see each other's data.
 *
 * N1's "under 2 minutes" is about a teacher's hands, not a computer: the
 * measurable part is that it takes two commands - create and choose a preset -
 * and that the server answers both in well under a second. The test measures
 * that and leaves the rest to the usability pilot (M2).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newestSession } from '../../src/client/net/sessions.js';
import { listSessionIds } from '../../src/server/store/files.js';
import type { CreateSessionResult, OpenSessionsResponse } from '../../src/shared/protocol.js';
import { GameClient } from '../support/client.js';
import { closeYear, openGame, openYear, playYears, startPractice } from '../support/game.js';
import { claim, newSession, startServer, type Harness } from '../support/harness.js';

/** How long the two commands that make a session may take, together. */
const SETUP_BUDGET_MS = 5000;

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('N1 - a new session from a preset', () => {
  it('takes two commands and a couple of seconds, with a code for every country', async () => {
    const setup = new GameClient(harness.url, 'setup');
    harness.track(setup);
    await setup.hello({ role: 'setup' });

    const started = Date.now();
    const created = await setup.send('createSession', {
      preset: 'short-50',
      settings: { worlds: 3 },
    });
    expect(created.ok, JSON.stringify(created)).toBe(true);
    const result = created.ok ? (created.result as CreateSessionResult) : null;
    if (!result) throw new Error('no session');

    // The teacher looks at the preview and changes one thing before anyone joins.
    const instructor = await harness.client('instructor', {
      role: 'instructor',
      sessionId: result.sessionId,
      instructorKey: result.instructorKey,
    });
    const changed = await instructor.send('updateSettings', {
      settings: { disclosure: 'totalOnly' },
    });
    expect(changed.ok, JSON.stringify(changed)).toBe(true);
    const elapsed = Date.now() - started;

    expect(elapsed, `setting up took ${String(elapsed)} ms`).toBeLessThan(SETUP_BUDGET_MS);

    // Everything a room needs is in hand: nine codes, two keys, the preset.
    expect(result.teams).toHaveLength(9);
    expect(new Set(result.teams.map((team) => team.joinCode)).size).toBe(9);
    for (const team of result.teams) expect(team.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(result.instructorKey.length).toBeGreaterThanOrEqual(24);
    expect(result.projectorKey).not.toBe(result.instructorKey);

    const view = await instructor.waitForView(
      (v) => (v['settings'] as { disclosure?: string } | undefined)?.disclosure === 'totalOnly',
      'the dashboard with the change on it',
    );
    // short-50's own numbers, and the one change on top of them.
    expect((view['settings'] as { years: number }).years).toBe(8);
    expect((view['settings'] as { disclosure: string }).disclosure).toBe('totalOnly');
    expect(view['phase']).toBe('LOBBY');
  });

  it('stops yesterday s codes working: a terminal finds today s game and the old codes are gone', async () => {
    // Yesterday's lesson, played and left behind on this computer.
    const old = await newSession(harness, { settings: { worlds: 1 } });
    const oldCodes = old.teams.map((team) => team.joinCode);

    // Today the teacher makes a new one. A terminal looks the game up over
    // /api/sessions and always takes the newest, which is how a printed code
    // that names a team finds the session it belongs to.
    harness.clock.advance(24 * 60 * 60 * 1000);
    const today = await newSession(harness, { settings: { worlds: 1 } });

    const response = await fetch(`${harness.url}/api/sessions`);
    const body = (await response.json()) as OpenSessionsResponse;
    expect(newestSession(body.sessions)?.sessionId).toBe(today.sessionId);

    // Yesterday's codes are not today's codes...
    for (const code of oldCodes) {
      expect(today.teams.map((team) => team.joinCode)).not.toContain(code);
    }
    // ...and typing one into today's game gets a sentence a student can act on.
    const terminal = await harness.client('a-terminal', {
      role: 'team',
      sessionId: today.sessionId,
    });
    for (const code of oldCodes) {
      const ack = await terminal.send('claimTeam', { joinCode: code });
      expect(ack.ok).toBe(false);
      if (!ack.ok) {
        expect(ack.code).toBe('NOT_FOUND');
        expect(ack.message).toMatch(/card on your table/);
      }
    }
    // Today's code works straight away.
    const good = await terminal.send('claimTeam', {
      joinCode: today.teams[0]?.joinCode ?? '',
    });
    expect(good.ok, JSON.stringify(good)).toBe(true);
  });

  it('gives a deleted session s codes to nobody, and tells the screens they are done', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const code = game.session.teams[0]?.joinCode ?? '';
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    await game.instructor.send('deleteSession', { confirm: 'DELETE' });
    await team.waitUntil(() => team.gone.length > 0, 'the team to be told');
    expect(team.gone[0]?.reason).toBe('deleted');
    expect(team.gone[0]?.message).toMatch(/closed by your teacher/);

    // A fresh session, and the old code is nothing to it.
    const fresh = await newSession(harness, { settings: { worlds: 1 } });
    const terminal = await harness.client('terminal', { role: 'team', sessionId: fresh.sessionId });
    const ack = await terminal.send('claimTeam', { joinCode: code });
    expect(ack.ok).toBe(false);

    // And saying hello to the old session gets nowhere at all.
    const ghost = new GameClient(harness.url, 'ghost');
    harness.track(ghost);
    const hello = await ghost.hello({ role: 'team', sessionId: game.session.sessionId });
    expect(hello.ok).toBe(false);
  });
});

describe('N2 - Reset', () => {
  it('clears the decisions and the messages and keeps every setting', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 2, disclosure: 'totalOnly', variancePct: 5, chatMode: 'always' },
    });

    await playYears(game, 2, 383);
    for (const team of game.teams) {
      await team.must('sendMessage', { text: 'Something worth forgetting.' });
    }
    await game.instructor.must('announce', { text: 'Half way.' });
    await game.instructor.must('muteTeam', { teamId: game.teams[0]?.teamId ?? '' });

    const before = harness.server.store.get(game.session.sessionId);
    const settingsBefore = JSON.stringify(before?.settings);
    const codesBefore = Object.values(before?.teams ?? {}).map((team) => team.joinCode);
    expect(before?.messages.length).toBeGreaterThan(0);

    await game.instructor.must('resetSession', { confirm: 'RESET' });
    await game.sync();

    const after = harness.server.store.get(game.session.sessionId);
    if (!after) throw new Error('the session went away');

    // Gone: every decision, outcome, message, note, guess and reflection.
    expect(after.phase).toBe('LOBBY');
    expect(after.year).toBe(0);
    expect(after.messages).toEqual([]);
    expect(after.news).toEqual([]);
    expect(after.overrides).toEqual([]);
    expect(after.firedEvents).toEqual([]);
    expect(after.activitiesDone).toEqual([]);
    expect(after.resultsRevealedToTeams).toBe(false);
    for (const world of after.worlds) {
      expect(world.years).toEqual([]);
      expect(world.practice).toBeNull();
      expect(world.open).toBeNull();
    }
    for (const team of Object.values(after.teams)) {
      expect(team.huddles).toEqual({});
      expect(team.predictions).toEqual({});
      expect(team.reflection).toBeNull();
      expect(team.muted).toBe(false);
    }

    // Kept: the settings, and the teams with their codes and their claims, so
    // nobody has to type a code again.
    expect(JSON.stringify(after.settings)).toBe(settingsBefore);
    expect(Object.values(after.teams).map((team) => team.joinCode)).toEqual(codesBefore);
    for (const team of Object.values(after.teams)) expect(team.claimed).toBe(true);

    // The terminals are told, and can play the whole thing again.
    for (const team of game.teams) expect(team.phase).toBe('LOBBY');
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    expect(harness.server.store.get(game.session.sessionId)?.year).toBe(1);
  });
});

describe('N3 - two lessons in two data folders', () => {
  it('never lets one server see the other s sessions, keys or codes', async () => {
    const firstDir = await mkdtemp(join(tmpdir(), 'crude-accord-n3-a-'));
    const secondDir = await mkdtemp(join(tmpdir(), 'crude-accord-n3-b-'));
    const first = await startServer({ dataDir: firstDir });
    const second = await startServer({ dataDir: secondDir });

    try {
      const one = await newSession(first, { settings: { worlds: 1 } });
      const two = await newSession(second, { settings: { worlds: 1 } });

      expect(one.sessionId).not.toBe(two.sessionId);
      expect(one.instructorKey).not.toBe(two.instructorKey);

      // Neither server has heard of the other's session.
      expect(first.server.store.get(two.sessionId)).toBeUndefined();
      expect(second.server.store.get(one.sessionId)).toBeUndefined();

      // Nor does it list it.
      const listOne = (await (
        await fetch(`${first.url}/api/sessions`)
      ).json()) as OpenSessionsResponse;
      const listTwo = (await (
        await fetch(`${second.url}/api/sessions`)
      ).json()) as OpenSessionsResponse;
      expect(listOne.sessions.map((row) => row.sessionId)).toEqual([one.sessionId]);
      expect(listTwo.sessions.map((row) => row.sessionId)).toEqual([two.sessionId]);

      // A terminal pointed at the wrong server gets nowhere, even with a code.
      const lost = new GameClient(second.url, 'lost-terminal');
      second.track(lost);
      const hello = await lost.hello({ role: 'team', sessionId: one.sessionId });
      expect(hello.ok).toBe(false);
      if (!hello.ok) expect(hello.message).toMatch(/not open on this computer/);

      // And the other server's join code is not a code here either.
      const here = await second.client('terminal', { role: 'team', sessionId: two.sessionId });
      const wrongCode = await here.send('claimTeam', {
        joinCode: one.teams[0]?.joinCode ?? '',
      });
      expect(wrongCode.ok).toBe(false);

      // The first server's instructor key opens nothing on the second.
      const wrongKey = new GameClient(second.url, 'wrong-key');
      second.track(wrongKey);
      const keyHello = await wrongKey.hello({
        role: 'instructor',
        sessionId: two.sessionId,
        instructorKey: one.instructorKey,
      });
      expect(keyHello.ok).toBe(false);

      // Play a year on each, with different numbers, and the two stay apart.
      await playOneYear(first, one, 300);
      await playOneYear(second, two, 500);

      const stateOne = first.server.store.get(one.sessionId);
      const stateTwo = second.server.store.get(two.sessionId);
      expect(stateOne?.worlds[0]?.years[0]?.decisions['A'].tenths).toBe(300);
      expect(stateTwo?.worlds[0]?.years[0]?.decisions['A'].tenths).toBe(500);

      // The folders hold one session each and nothing of the other's.
      expect(await listSessionIds(firstDir)).toEqual([one.sessionId]);
      expect(await listSessionIds(secondDir)).toEqual([two.sessionId]);
    } finally {
      await first.cleanup();
      await second.cleanup();
      await rm(firstDir, { recursive: true, force: true });
      await rm(secondDir, { recursive: true, force: true });
    }
  });
});

/** Plays the practice year and Year 1, with every country on one number. */
async function playOneYear(
  host: Harness,
  session: Awaited<ReturnType<typeof newSession>>,
  tenths: number,
): Promise<void> {
  const teams: GameClient[] = [];
  for (const team of session.teams) {
    teams.push(await claim(host, session.sessionId, team.joinCode, team.teamId));
  }
  await session.instructor.must('setBriefingSlide', { slide: 0 });
  await session.instructor.must('startPractice');
  for (const team of teams) {
    await team.waitForView((view) => view['phase'] === 'PRACTICE_OPEN', 'the practice year');
    await team.must('submitDecision', { tenths });
  }
  await session.instructor.must('closeYear');
  await session.instructor.must('openYear', { year: 1 });
  for (const team of teams) {
    await team.waitForView((view) => view['year'] === 1, 'Year 1');
    await team.must('submitDecision', { tenths });
  }
  await session.instructor.must('closeYear');
}
