/**
 * R2 to R8 - the things that go wrong in a real room.
 *
 * R2 a terminal offline for two minutes comes back with a full catch-up.
 * R3 a dead computer is replaced after 15 s; the old one is told.
 * R4 a group that claims in Year 6 plays from there; its earlier years are auto.
 * R5 a group that never claims is auto all the way, flagged, and harmless.
 * R6 the server is killed mid-year and restarts: restored and paused.
 * R7 the instructor's browser is closed for five minutes; the game continues.
 * R8 the projector is closed and reopened and shows the right screen.
 *
 * R1 is a browser test (a reload has to restore the typed number from
 * localStorage), so it lives in the end-to-end suite and in a component test.
 *
 * The clock is the test's own, so "two minutes" and "five minutes" cost nothing
 * and the 15-second takeover rule is exercised exactly at its boundary.
 */

import { rm } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import { TAKEOVER_AFTER_MS } from '../../src/server/session/apply.js';
import type { ClaimTeamResult } from '../../src/shared/protocol.js';
import { GameClient } from '../support/client.js';
import {
  closeYear,
  openGame,
  openYear,
  playYears,
  startPractice,
  submitAll,
  syncClients,
  waitConnected,
} from '../support/game.js';
import { claim, newSession, startServer, TestClock, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('R2 - a terminal offline for two minutes', () => {
  it('rejoins with everything it missed', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const away = game.teams[0];
    const stayed = game.teams.slice(1);
    if (!away) throw new Error('no team');
    const token = away.token;

    await startPractice(game);
    await submitAll(game, 383);
    await closeYear(game);
    await openYear(game, 1);

    // The laptop's lid goes down.
    away.disconnect();
    await waitConnected(game.instructor, away.teamId ?? '', false);

    harness.clock.advance(2 * 60 * 1000);

    // Two years are played without it, with a messaging window in the middle,
    // so there is plenty to catch up on. The waiting is done on
    // the terminals that are still here: game.sync() waits for all nine, and
    // one of them is deliberately gone.
    const settle = () => syncClients(game.instructor, stayed);

    for (const team of stayed) await team.must('submitDecision', { tenths: 400 });
    await game.instructor.must('closeYear');
    await settle();
    await game.instructor.must('setMessaging', { on: true, seconds: 60 });
    await settle();
    for (const team of stayed) await team.must('sendMessage', { text: 'Where did they go?' });
    await game.instructor.must('setMessaging', { on: false });
    await settle();
    await game.instructor.must('openYear', { year: 2 });
    await settle();
    for (const team of stayed) await team.must('submitDecision', { tenths: 420 });
    await game.instructor.must('closeYear');
    await settle();
    await game.instructor.must('openYear', { year: 3 });
    await settle();

    // It comes back as itself, with its saved token.
    const back = new GameClient(harness.url, 'came-back');
    harness.track(back);
    const hello = await back.hello({
      role: 'team',
      sessionId: game.session.sessionId,
      ...(token ? { teamToken: token } : {}),
    });
    expect(hello.ok).toBe(true);
    if (hello.ok) {
      expect(hello.needsClaim).toBe(false);
      expect(hello.teamId).toBe(away.teamId);
    }

    const view = await back.waitForView((v) => v['kind'] === 'team', 'its catch-up view');

    // A full view, not a diff: where the game is now...
    expect(view['phase']).toBe('YEAR_OPEN');
    expect(view['year']).toBe(3);
    // ...every year it missed, including the two it was auto-filled for...
    const history = view['history'] as Array<{ year: number; isPractice: boolean }>;
    expect(history.filter((row) => !row.isPractice).map((row) => row.year)).toEqual([1, 2]);
    // ...the messages it never saw, and the messaging switch as it stands now...
    const messages = view['messages'] as Array<{ text: string }>;
    expect(messages.map((row) => row.text)).toContain('Where did they go?');
    expect(view['messaging']).toEqual({ on: false, until: null });
    // ...and its own two auto decisions, marked as auto.
    const state = harness.server.store.get(game.session.sessionId);
    for (const year of [1, 2]) {
      const record = state?.worlds[0]?.years.find((row) => row.year === year);
      expect(record?.decisions['A'].auto).toBe(true);
      expect(record?.decisions['A'].source).toBe('auto');
    }
    // It can play again straight away.
    await back.must('submitDecision', { tenths: 371 });
    expect(state?.worlds[0]?.open).toBeDefined();
  });
});

describe('R3 - the computer running a country dies', () => {
  it('lets a different computer claim it after 15 s, and tells the old one', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const dead = game.teams[0];
    if (!dead) throw new Error('no team');
    const joinCode = game.session.teams.find((row) => row.teamId === dead.teamId)?.joinCode ?? '';

    await startPractice(game);
    await dead.must('submitDecision', { tenths: 383 });

    // The machine freezes: the socket goes, the team stays claimed.
    const oldToken = dead.token;
    dead.disconnect();
    await waitConnected(game.instructor, dead.teamId ?? '', false);

    // Too soon: the teacher is asked, because the other computer may be fine.
    harness.clock.advance(TAKEOVER_AFTER_MS - 1000);
    const tooSoon = new GameClient(harness.url, 'spare-too-soon');
    harness.track(tooSoon);
    await tooSoon.hello({ role: 'team', sessionId: game.session.sessionId });
    const asked = await tooSoon.send('claimTeam', { joinCode });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.code).toBe('NEEDS_APPROVAL');
    tooSoon.close();

    // Past fifteen seconds: the spare computer simply takes it.
    harness.clock.advance(2000);
    const spare = new GameClient(harness.url, 'spare');
    harness.track(spare);
    await spare.hello({ role: 'team', sessionId: game.session.sessionId });
    const took = await spare.send('claimTeam', { joinCode });
    expect(took.ok, JSON.stringify(took)).toBe(true);
    const result = took.ok ? (took.result as ClaimTeamResult) : null;
    expect(result?.tookOver).toBe(true);
    expect(result?.teamId).toBe(dead.teamId);
    expect(result?.token).not.toBe(oldToken);
    spare.teamId = result?.teamId ?? null;
    spare.token = result?.token ?? null;

    // The new computer has the country, decision and all.
    const view = await spare.waitForView((v) => v['kind'] === 'team', 'the country');
    expect((view['decision'] as { tenths: number }).tenths).toBe(383);
    // A number nothing else in a view could be, so the search below means
    // something: not a price, a timer or a version.
    await spare.must('submitDecision', { tenths: 417 });

    // The frozen one wakes up, presents its old token, and is told plainly.
    const revived = new GameClient(harness.url, 'revived');
    harness.track(revived);
    const hello = await revived.hello({
      role: 'team',
      sessionId: game.session.sessionId,
      ...(oldToken ? { teamToken: oldToken } : {}),
    });
    expect(hello.ok).toBe(true);
    // The token is no longer this team's, so the screen is sent back to the
    // join page - which is what shows the takeover screen.
    if (hello.ok) {
      expect(hello.needsClaim).toBe(true);
      expect(hello.teamId).toBeNull();
    }
    // And it is told nothing about the country it used to run.
    const lobby = await revived.waitForView((v) => v['kind'] === 'lobby', 'the lobby view');
    expect(JSON.stringify(lobby)).not.toContain('417');

    // Asking again, with the code, now needs the teacher: the spare is live.
    const again = await revived.send('claimTeam', { joinCode });
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.code).toBe('NEEDS_APPROVAL');
      expect(again.message).toMatch(/already open on another computer/);
    }

    // The spare keeps the country and its number.
    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.teams[dead.teamId ?? '']?.token).toBe(result?.token);
    expect(state?.worlds[0]?.open?.decisions['A']?.tenths).toBe(417);
  });
});

describe('R4 - a group that arrives late', () => {
  it('claims in Year 6 and plays from there, with its earlier years auto and flagged', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1 },
      // Countries B and C play from the start; A is the group that is late.
      claimAll: false,
    });
    const codes = new Map(game.session.teams.map((row) => [row.letter, row.joinCode]));

    const b = await claim(harness, game.session.sessionId, codes.get('B') ?? '', 'world-1-B');
    const c = await claim(harness, game.session.sessionId, codes.get('C') ?? '', 'world-1-C');

    const playing = [b, c];
    const settle = () => syncClients(game.instructor, playing);

    await game.instructor.must('setBriefingSlide', { slide: 0 });
    await game.instructor.must('startPractice');
    await settle();
    for (const team of playing) await team.must('submitDecision', { tenths: 383 });
    await game.instructor.must('closeYear');
    await settle();

    for (let year = 1; year <= 5; year += 1) {
      await game.instructor.must('openYear', { year });
      await settle();
      for (const team of playing) await team.must('submitDecision', { tenths: 383 });
      await game.instructor.must('closeYear');
      await settle();
    }

    // Year 6 opens, and the late group finally finds the room.
    await game.instructor.must('openYear', { year: 6 });
    await settle();
    const late = await claim(harness, game.session.sessionId, codes.get('A') ?? '', 'late-group');
    await late.must('setMembers', { names: ['Nia'] });

    const view = await late.waitForView((v) => v['kind'] === 'team', 'its own screen');
    expect(view['year']).toBe(6);

    // It plays from here on, like anyone else.
    await late.must('submitDecision', { tenths: 300 });
    await game.instructor.must('closeYear');
    await syncClients(game.instructor, [...playing, late]);
    await game.instructor.must('openYear', { year: 7 });
    await syncClients(game.instructor, [...playing, late]);
    await late.must('submitDecision', { tenths: 310 });
    await game.instructor.must('closeYear');
    await syncClients(game.instructor, [...playing, late]);

    const state = harness.server.store.get(game.session.sessionId);
    const world = state?.worlds[0];
    if (!world) throw new Error('no world');

    // Years 1 to 5 were filled in for it, flagged auto, and the numbers follow
    // the rule: the starting output in Year 1, then last year's over again.
    const startingTenths = 400;
    for (let year = 1; year <= 5; year += 1) {
      const record = world.years.find((row) => row.year === year);
      expect(record?.decisions['A'].auto, `Year ${String(year)}`).toBe(true);
      expect(record?.decisions['A'].source).toBe('auto');
      expect(record?.decisions['A'].tenths).toBe(startingTenths);
    }
    // And from Year 6 the group's own numbers are its own, not auto.
    expect(world.years.find((row) => row.year === 6)?.decisions['A']).toMatchObject({
      tenths: 300,
      auto: false,
      source: 'team',
    });
    expect(world.years.find((row) => row.year === 7)?.decisions['A']).toMatchObject({
      tenths: 310,
      auto: false,
    });

    // The dashboard shows it as a country that was filled in, not as a gap.
    const grid = game.instructor.view['teams'] as Array<{
      teamId: string;
      claimed: boolean;
      connected: boolean;
    }>;
    expect(grid.find((row) => row.teamId === 'world-1-A')).toMatchObject({
      claimed: true,
      connected: true,
    });
    // Its history, as it sees it, covers every year including the auto ones.
    const history = late.view['history'] as Array<{ year: number; ownAuto?: boolean }>;
    expect(history.filter((row) => row.year >= 1).map((row) => row.year)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });
});

describe('R5 - a group that never claims at all', () => {
  it('is filled in and flagged every year, and changes nothing for anyone else', async () => {
    const game = await openGame(harness, {
      settings: { worlds: 1, years: 4, schedule: [], newProducer: { enabled: false } },
      claimAll: false,
    });
    const codes = new Map(game.session.teams.map((row) => [row.letter, row.joinCode]));
    const b = await claim(harness, game.session.sessionId, codes.get('B') ?? '', 'world-1-B');
    const c = await claim(harness, game.session.sessionId, codes.get('C') ?? '', 'world-1-C');

    const playing = [b, c];
    const settle = () => syncClients(game.instructor, playing);

    await game.instructor.must('setBriefingSlide', { slide: 0 });
    await game.instructor.must('startPractice');
    await settle();
    for (const team of playing) await team.must('submitDecision', { tenths: 383 });
    await game.instructor.must('closeYear');
    await settle();

    for (let year = 1; year <= 4; year += 1) {
      await game.instructor.must('openYear', { year });
      await settle();
      for (const team of playing) await team.must('submitDecision', { tenths: 383 });
      await game.instructor.must('closeYear');
      await settle();
    }
    await game.instructor.must('endGame');
    await settle();

    const state = harness.server.store.get(game.session.sessionId);
    const world = state?.worlds[0];
    if (!world) throw new Error('no world');

    expect(world.years).toHaveLength(4);
    for (const record of world.years) {
      // A is auto and flagged...
      expect(record.decisions['A'].auto).toBe(true);
      expect(record.decisions['A'].source).toBe('auto');
      // ...and B and C are not, so the flag means something.
      expect(record.decisions['B'].auto).toBe(false);
      expect(record.decisions['C'].auto).toBe(false);
      // The year still resolved properly: a price, and a profit for everyone.
      expect(record.outcome.priceCents).toBeGreaterThan(0);
      for (const letter of COUNTRY_LETTERS) {
        expect(record.outcome.countries[letter].profitK).toBeDefined();
      }
    }

    // The two groups that did play got a complete game, with an outcome and a
    // cumulative profit for every year.
    for (const team of playing) {
      const history = team.view['history'] as Array<{ year: number; cumulativeProfitK: number }>;
      const scored = history.filter((row) => row.year >= 1);
      expect(scored).toHaveLength(4);
      expect(scored[3]?.cumulativeProfitK).toBeGreaterThan(0);
    }

    // And the dashboard says plainly that nobody ever took that country.
    const grid = game.instructor.view['teams'] as Array<{ teamId: string; claimed: boolean }>;
    expect(grid.find((row) => row.teamId === 'world-1-A')?.claimed).toBe(false);
  });
});

describe('R6 - the server is killed in the middle of a year', () => {
  it('comes back with the state restored and paused, and every screen reconnects', async () => {
    const dataDir = harness.dataDir;
    const clock = harness.clock;
    const game = await openGame(harness, { settings: { worlds: 2 } });
    const sessionId = game.session.sessionId;
    const tokens = game.teams.map((team) => ({ name: team.name, token: team.token }));

    await playYears(game, 1, 383);
    await openYear(game, 2);
    for (const team of game.teams) await team.must('submitDecision', { tenths: 377 });

    const before = harness.server.store.get(sessionId);
    const beforeVersion = before?.version ?? 0;
    expect(before?.timer.paused).toBe(false);
    expect(before?.timer.deadline).not.toBeNull();

    // The power goes. No graceful shutdown, no snapshot of the open year: the
    // sockets are dropped and the process is gone.
    for (const team of game.teams) team.close();
    game.instructor.close();
    await harness.server.close();

    // Back inside thirty seconds, same data folder.
    clock.advance(25_000);
    const restarted = await startServer({ dataDir, clock, tickMs: 0 });

    const after = restarted.server.store.get(sessionId);
    if (!after) throw new Error('the session did not come back');

    // Everything played is there, to the last decision.
    expect(after.version).toBe(beforeVersion);
    expect(after.phase).toBe('YEAR_OPEN');
    expect(after.year).toBe(2);
    for (const world of after.worlds) {
      expect(world.years).toHaveLength(1);
      expect(world.practice).not.toBeNull();
      for (const letter of COUNTRY_LETTERS) {
        expect(world.open?.decisions[letter]?.tenths).toBe(377);
      }
    }
    // Paused, with the time it had left, and saying why (SPEC section 9).
    expect(after.timer.paused).toBe(true);
    expect(after.timer.restarted).toBe(true);
    expect(after.timer.deadline).toBeNull();
    expect(after.timer.remainingMs).toBeGreaterThan(0);

    // Every screen comes back. The terminals present their saved tokens.
    const url = restarted.url;
    const desk = new GameClient(url, 'dashboard-again');
    const helloDesk = await desk.hello({
      role: 'instructor',
      sessionId,
      instructorKey: game.session.instructorKey,
    });
    expect(helloDesk.ok).toBe(true);
    const deskView = await desk.waitForView((v) => v['kind'] === 'instructor', 'the dashboard');
    expect((deskView['timing'] as { resumedAfterRestart: boolean }).resumedAfterRestart).toBe(true);

    const room = new GameClient(url, 'projector-again');
    const helloRoom = await room.hello({
      role: 'projector',
      sessionId,
      projectorKey: game.session.projectorKey,
    });
    expect(helloRoom.ok).toBe(true);

    const terminals: GameClient[] = [];
    for (const { name, token } of tokens) {
      const client = new GameClient(url, `${name}-again`);
      terminals.push(client);
      const hello = await client.hello({
        role: 'team',
        sessionId,
        ...(token ? { teamToken: token } : {}),
      });
      expect(hello.ok, `${name} could not come back`).toBe(true);
      if (hello.ok) expect(hello.needsClaim).toBe(false);
      await client.waitForView((v) => v['kind'] === 'team', `${name} to get its screen`);
    }
    expect(terminals).toHaveLength(6);

    // And the teacher presses Resume and the lesson carries on.
    const resumed = await desk.send('resume');
    expect(resumed.ok).toBe(true);
    await desk.waitForView(
      (v) => (v['timing'] as { paused: boolean }).paused === false,
      'the timer running again',
    );
    const playing = terminals[0];
    if (!playing) throw new Error('no terminal');
    await playing.waitForView((v) => v['phase'] === 'YEAR_OPEN', 'the open year');
    const played = await playing.send('submitDecision', { tenths: 390 });
    expect(played.ok, JSON.stringify(played)).toBe(true);

    for (const client of [desk, room, ...terminals]) client.close();
    await restarted.stop();
    await rm(dataDir, { recursive: true, force: true });
  });
});

describe('R7 - the instructor closes the browser for five minutes', () => {
  it('leaves the game running and gives the dashboard back as it was', async () => {
    // A real tick, because the point is that the clock keeps the lesson moving
    // with nobody watching it.
    const clock = new TestClock();
    const own = await startServer({ clock, tickMs: 20 });
    try {
      const session = await newSession(own, {
        settings: { worlds: 1, timers: { earlyYearSeconds: 5, practiceSeconds: 5 } },
      });
      const teams: GameClient[] = [];
      for (const team of session.teams) {
        teams.push(await claim(own, session.sessionId, team.joinCode, team.teamId));
      }

      const settle = () => syncClients(session.instructor, teams);

      await session.instructor.must('setBriefingSlide', { slide: 0 });
      await session.instructor.must('startPractice');
      await settle();
      await session.instructor.must('closeYear');
      await settle();
      await session.instructor.must('openYear', { year: 1 });
      await settle();
      for (const team of teams) await team.must('submitDecision', { tenths: 383 });

      // The teacher closes the laptop lid.
      session.instructor.close();

      // Five minutes pass. The year's timer runs out and the clock closes it,
      // with no dashboard connected at all.
      clock.advance(5 * 60 * 1000);
      const anyTeam = teams[0];
      if (!anyTeam) throw new Error('no team');
      await anyTeam.waitForView(
        (view) => view['phase'] === 'YEAR_REVEAL',
        'the clock to close Year 1 with nobody watching',
      );

      const state = own.server.store.get(session.sessionId);
      expect(state?.year).toBe(1);
      expect(state?.worlds[0]?.years).toHaveLength(1);
      // The decisions the groups made are all there, none of them auto.
      for (const letter of COUNTRY_LETTERS) {
        expect(state?.worlds[0]?.years[0]?.decisions[letter].auto).toBe(false);
      }

      // The teacher opens the link again and gets the dashboard back, where the
      // game actually is rather than where they left it.
      const again = await own.client('dashboard-again', {
        role: 'instructor',
        sessionId: session.sessionId,
        instructorKey: session.instructorKey,
      });
      const view = await again.waitForView((v) => v['kind'] === 'instructor', 'the dashboard');
      expect(view['phase']).toBe('YEAR_REVEAL');
      expect(view['year']).toBe(1);
      expect((view['worlds'] as unknown[]).length).toBe(1);
      // And the one suggested button is the right next step, not a stale one.
      expect((view['suggested'] as { command: string }).command).toBe('openYear');
      const next = await again.send(
        'openYear',
        { year: 2 },
        {
          expectedPhase: 'YEAR_REVEAL',
          expectedYear: 1,
        },
      );
      expect(next.ok, JSON.stringify(next)).toBe(true);
    } finally {
      await own.cleanup();
    }
  });
});

describe('R8 - the projector is closed and reopened', () => {
  it('comes back on whatever screen the instructor is showing', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 2,
        years: 2,
        schedule: [],
        newProducer: { enabled: false },
        timers: { earlyYearsThrough: 1 },
      },
    });
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });

    await playYears(game, 1, 383);
    await game.instructor.must('endGame');
    await game.instructor.must('setProjectorScreen', { screen: 'worldDetail', worldNumber: 2 });
    await projector.waitForView(
      (view) => view['screen'] === 'worldDetail' && view['debrief'] !== null,
      'World Detail on the projector',
    );
    projector.close();

    // Someone shuts the lid on the second laptop and opens it again.
    const again = await harness.client('projector-again', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    const view = await again.waitForView((v) => v['kind'] === 'projector', 'the room screen');

    expect(view['screen']).toBe('worldDetail');
    expect(view['worldNumber']).toBe(2);
    // And the debrief data it needs to draw that screen came with it.
    const debrief = view['debrief'] as { worlds: unknown[] } | null;
    expect(debrief?.worlds).toHaveLength(2);
    // Still a projector view and nothing more: no chat, no keys.
    const state = harness.server.store.get(game.session.sessionId);
    expect(JSON.stringify(view)).not.toContain(state?.instructorKey ?? 'x');
    expect(JSON.stringify(view)).not.toContain(state?.projectorKey ?? 'x');

    // Back to the room screen, and the reopened projector follows.
    await game.instructor.must('setProjectorScreen', { screen: 'auto' });
    const back = await again.waitForView((v) => v['screen'] === 'auto', 'the room screen again');
    // Nothing from the debrief is left behind on it.
    expect(back['debrief']).toBeNull();
    expect(back['worldNumber']).toBeNull();
    expect(back['phase']).toBe('ENDED');
  });
});
