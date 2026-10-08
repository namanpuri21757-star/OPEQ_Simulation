/**
 * The dashboard against a real server.
 *
 * The component tests check that each control sends the right command with the
 * right guards. These check the other half: that the server accepts what the
 * dashboard sends, that the view the dashboard draws from carries what the
 * screens need, and that a whole game can be run by pressing only the one
 * suggested button - which is the promise the design makes to a teacher.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { CreateSessionResult } from '../../src/shared/protocol.js';
import type { InstructorView } from '../../src/shared/views.js';
import { InstructorBot } from '../bots/instructorBot.js';
import { TeamBot, type Strategy } from '../bots/teamBot.js';
import { GameClient } from '../support/client.js';
import { openGame, startPractice, submitAll } from '../support/game.js';
import { startServer, TestClock, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** The dashboard's view, typed, from the instructor's last message. */
function dashboard(client: GameClient): InstructorView {
  return client.view as unknown as InstructorView;
}

describe('what the dashboard is sent', () => {
  it('carries a join code, a status and a decision for every country', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });
    await startPractice(game);
    await game.teams[0]?.must('submitDecision', { tenths: 383 });
    await game.instructor.waitForView((view) => {
      const teams = view['teams'] as Array<{ decision: unknown }>;
      return teams.some((team) => team.decision !== null);
    }, 'the first decision to show');

    const view = dashboard(game.instructor);
    expect(view.teams).toHaveLength(6);
    for (const team of view.teams) {
      expect(team.joinCode).toHaveLength(6);
      expect(team.connected).toBe(true);
      expect(team.claimed).toBe(true);
    }

    const first = view.teams.find((team) => team.teamId === game.teams[0]?.teamId);
    expect(first?.decision).toMatchObject({ tenths: 383, source: 'team', auto: false });
    expect(typeof first?.decision?.at).toBe('number');
  });

  it('keeps the chosen preset when the setup form also sends a change', async () => {
    // A patch has to stay a patch: picking test-fast and setting the number of
    // worlds must not quietly hand back standard-75's timers and schedule.
    const setup = await harness.client('setup', { role: 'setup' });
    const ack = await setup.send('createSession', {
      preset: 'test-fast',
      settings: { worlds: 2 },
    });
    if (!ack.ok) throw new Error(ack.message);
    const session = ack.result as CreateSessionResult;

    const instructor = await harness.client('instructor', {
      role: 'instructor',
      sessionId: session.sessionId,
      instructorKey: session.instructorKey,
    });

    const settings = dashboard(instructor).settings;
    expect(settings.worlds).toBe(2);
    expect(settings.timers.practiceSeconds).toBe(5);
    expect(settings.timers.laterYearSeconds).toBe(5);
    expect(settings.schedule.map((item) => item.seconds)).toEqual([5, 5, 5]);
  });

  it('says a pause came from a restart, and stops saying it after Resume', async () => {
    const dataDir = harness.dataDir;
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const { sessionId, instructorKey } = game.session;
    await startPractice(game);
    await submitAll(game, 400);

    // Stop mid-year without removing the folder, then come back on it.
    await harness.stop();
    harness = await startServer({ dataDir, clock: new TestClock(1_700_000_500_000) });
    const instructor = await harness.client('instructor', {
      role: 'instructor',
      sessionId,
      instructorKey,
    });

    const after = dashboard(instructor);
    expect(after.phase).toBe('PRACTICE_OPEN');
    expect(after.timing.paused).toBe(true);
    expect(after.timing.resumedAfterRestart).toBe(true);

    await instructor.must('resume');
    expect(dashboard(instructor).timing.resumedAfterRestart).toBe(false);
    expect(dashboard(instructor).timing.paused).toBe(false);
  });

  it('does not call an ordinary pause a restart', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    await startPractice(game);

    await game.instructor.must('pause');
    expect(dashboard(game.instructor).timing.paused).toBe(true);
    expect(dashboard(game.instructor).timing.resumedAfterRestart).toBe(false);
  });

  it('collects the network check results the /check page sends', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const checker = await harness.client('check', {
      role: 'check',
      sessionId: game.session.sessionId,
    });

    const pong = await checker.send('ping');
    expect(pong.ok).toBe(true);

    await checker.must('report', { clientId: 'laptop-7', rttMs: 42, transport: 'websocket' });
    await game.instructor.waitForView(
      (view) => Object.keys(view['networkChecks'] as object).length === 1,
      'the check to reach the dashboard',
    );

    expect(dashboard(game.instructor).networkChecks['laptop-7']).toMatchObject({
      rttMs: 42,
      transport: 'websocket',
      // No token was presented, so this is "another computer" in the lobby.
      teamId: null,
    });
  });

  it('puts a check from a team’s computer on that team, from its token alone', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('the game should have claimed a team');

    // The check page is a separate tab on the same computer, so it presents the
    // token the terminal saved - and nothing else.
    const checker = await harness.client('check-on-team', {
      role: 'check',
      sessionId: game.session.sessionId,
      teamToken: team.token ?? '',
    });
    await checker.must('report', { clientId: 'group-laptop', rttMs: 31, transport: 'websocket' });
    await game.instructor.waitForView(
      (view) => Object.keys(view['networkChecks'] as object).length === 1,
      'the check to reach the dashboard',
    );

    expect(dashboard(game.instructor).networkChecks['group-laptop']).toMatchObject({
      rttMs: 31,
      teamId: team.teamId,
    });
  });

  it('does not let a check page claim to be a team it has no token for', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const checker = await harness.client('fake-check', {
      role: 'check',
      sessionId: game.session.sessionId,
      teamToken: 'not-a-real-token-at-all',
    });

    await checker.must('report', { clientId: 'stranger', rttMs: 20, transport: 'websocket' });
    await game.instructor.waitForView(
      (view) => Object.keys(view['networkChecks'] as object).length === 1,
      'the check to reach the dashboard',
    );

    expect(dashboard(game.instructor).networkChecks['stranger']?.teamId).toBeNull();
  });

  it('never counts a check page as a team’s terminal', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 }, claimAll: true });
    const team = game.teams[0];
    if (!team) throw new Error('the game should have claimed a team');
    const token = team.token ?? '';
    team.close();
    await game.instructor.waitForView(
      (view) =>
        ((view['teams'] as Array<{ teamId: string; connected: boolean }>).find(
          (row) => row.teamId === team.teamId,
        )?.connected ?? true) === false,
      'the terminal to be seen as offline',
    );

    // A check page on the same computer presents the same token. The country is
    // still without a terminal, and the dashboard has to keep saying so.
    await harness.client('check-after-close', {
      role: 'check',
      sessionId: game.session.sessionId,
      teamToken: token,
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const row = dashboard(game.instructor).teams.find(
      (candidate) => candidate.teamId === team.teamId,
    );
    expect(row?.connected).toBe(false);
  });

  it('keeps each world’s messages in its own feed', async () => {
    const game = await openGame(harness, { settings: { worlds: 2 } });
    await game.instructor.must('setMessaging', { on: true });
    const world1 = game.world(1);
    const world2 = game.world(2);

    await world1['A']?.must('sendMessage', { text: 'World one here.' });
    await world2['B']?.must('sendMessage', { text: 'World two here.' });
    // Views are throttled to ten a second, so the dashboard can be one message
    // behind the terminals for a moment.
    await game.instructor.waitForView(
      (view) => (view['messages'] as unknown[]).length === 2,
      'both messages to reach the dashboard',
    );

    const feeds = dashboard(game.instructor).messagesByWorld;
    expect(feeds['world-1']?.map((m) => m.text)).toEqual(['World one here.']);
    expect(feeds['world-2']?.map((m) => m.text)).toEqual(['World two here.']);
  });

  it('accepts an override with a reason and logs it', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    await startPractice(game);
    const teamId = game.teams[0]?.teamId ?? '';

    await game.instructor.must('overrideDecision', {
      teamId,
      tenths: 425,
      reason: 'Their laptop died.',
    });

    const view = dashboard(game.instructor);
    expect(view.teams.find((team) => team.teamId === teamId)?.decision).toMatchObject({
      tenths: 425,
      source: 'instructor',
    });
    expect(view.overrides).toHaveLength(1);
    expect(view.overrides[0]).toMatchObject({
      teamId,
      toTenths: 425,
      reason: 'Their laptop died.',
    });
  });

  it('refuses an override aimed at a year the game has left', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    await startPractice(game);
    await submitAll(game, 400);
    await game.instructor.must('closeYear');
    await game.instructor.must('openYear', { year: 1 });

    // The guards are what the dashboard was showing a moment ago.
    const ack = await game.instructor.send(
      'overrideDecision',
      { teamId: game.teams[0]?.teamId ?? '', tenths: 400, reason: 'Too late.' },
      { expectedPhase: 'PRACTICE_OPEN', expectedYear: 0 },
    );

    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe('STALE');
  });

  it('shows a takeover request, and hands the team over when it is approved', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const first = game.teams[0];
    const joinCode = game.session.teams[0]?.joinCode ?? '';
    const teamId = first?.teamId ?? '';

    const second = await harness.client('second-terminal', {
      role: 'team',
      sessionId: game.session.sessionId,
    });
    const asked = await second.send('claimTeam', { joinCode });
    expect(asked.ok).toBe(false);
    if (!asked.ok) expect(asked.code).toBe('NEEDS_APPROVAL');

    await game.instructor.waitForView(
      (view) =>
        (view['teams'] as Array<{ teamId: string; pendingTakeover: boolean }>).some(
          (team) => team.teamId === teamId && team.pendingTakeover,
        ),
      'the request to show on the dashboard',
    );

    await game.instructor.must('approveTakeover', { teamId });
    await second.waitUntil(() => second.claimed.length > 0, 'the new terminal to be let in');
    expect(second.claimed[0]?.teamId).toBe(teamId);
  });
});

/**
 * The scripted run: nine groups, one teacher, and only the big button.
 *
 * It is the whole design principle as a test. If following nextSuggestedAction
 * cannot finish a game, then a teacher who is busy with the room cannot either.
 */
describe('a whole game run from the suggested button', () => {
  it('reaches the end with every scheduled step on the way', async () => {
    const strategies: Strategy[] = [
      'cooperative',
      'competitive',
      'cheater',
      'titForTat',
      'lateSubmitter',
      'cooperative',
      'competitive',
      'cheater',
      'random',
    ];

    const setup = new GameClient(harness.url, 'setup');
    harness.track(setup);
    await setup.hello({ role: 'setup' });
    const ack = await setup.send('createSession', {
      // Short years so nine bots and twelve years finish quickly; the schedule,
      // the new producer and the final-year warning are the standard ones.
      preset: 'test-fast',
      settings: { worlds: 3 },
    });
    if (!ack.ok) throw new Error(ack.message);
    const session = ack.result as CreateSessionResult;
    setup.close();

    const teacher = new InstructorBot(harness.url, session.sessionId, session.instructorKey);
    harness.track(teacher.client);
    await teacher.join();

    const bots: TeamBot[] = [];
    for (const [index, team] of session.teams.entries()) {
      const bot = new TeamBot({
        url: harness.url,
        sessionId: session.sessionId,
        joinCode: team.joinCode,
        strategy: strategies[index] ?? 'cooperative',
        name: team.teamId,
        seed: index + 1,
      });
      harness.track(bot.client);
      await bot.join();
      bots.push(bot);
    }
    expect(bots).toHaveLength(9);

    // No automatic tick in this harness, so the only thing that moves the game
    // on is the suggested button.
    for (let step = 0; step < 400; step += 1) {
      const phase = teacher.phase;

      if (phase === 'PRACTICE_OPEN' || phase === 'YEAR_OPEN') {
        await waitAll(bots, phase, teacher.year);
        for (const bot of bots) {
          const result = await bot.playOpenYear();
          expect(result.ok).toBe(true);
        }
      }
      if (phase === 'BETWEEN') {
        await waitAll(bots, phase, teacher.year);
        for (const bot of bots) await bot.talk();
      }
      if (phase === 'ENDED') {
        await waitAll(bots, phase, teacher.year);
        for (const bot of bots) await bot.reflect();
      }

      const pressed = await teacher.step();
      if (!pressed) break;
      if (!pressed.ok) throw new Error(`the dashboard was stopped: ${pressed.message}`);
      await teacher.client.waitForView(
        (view) => (view['version'] as number) >= pressed.version,
        'the dashboard to catch up',
      );
    }

    const view = dashboard(teacher.client);
    expect(view.phase).toBe('ENDED');
    expect(view.resultsRevealedToTeams).toBe(true);

    // The labels the teacher actually read, in order. Every scheduled step from
    // SPEC section 4 has to be among them.
    const labels = teacher.steps;
    expect(labels[0]).toBe('Start briefing');
    for (const label of [
      'Start the practice year',
      'Close the practice year',
      'Start Year 1',
      'Close Year 1',
      'Turn messaging on for 5 s',
      'Turn messaging off',
      'Hold the summit (5 s)',
      'Announce the final year',
      'Close Year 12',
      'End the game',
      'Reveal results to teams',
    ]) {
      expect(labels, `the dashboard never offered "${label}"`).toContain(label);
    }

    // The schedule ran rather than being skipped, and every world played.
    expect(view.activitiesDone).toEqual(['3:chat', '7:summit', '10:chat']);
    expect(view.finalYearAnnounced).toBe(true);
    for (const world of view.worlds) {
      const scored = world.records.filter((record) => !record.isPractice);
      expect(scored).toHaveLength(12);
      expect(world.records.some((record) => record.isPractice)).toBe(true);
      expect(scored.some((record) => record.newProducerTenths > 0)).toBe(true);
      for (const record of scored) {
        expect(Object.keys(record.countries).length).toBe(COUNTRY_LETTERS.length);
      }
    }

    // Nine countries, each with a total and a reflection.
    expect(view.leaderboard.countries).toHaveLength(9);
    expect(view.teams.every((team) => team.reflection !== null)).toBe(true);
  }, 120_000);
});

async function waitAll(bots: TeamBot[], phase: string, year: number): Promise<void> {
  await Promise.all(
    bots.map((bot) =>
      bot.client.waitForView(
        (view) => view['phase'] === phase && view['year'] === year,
        `${bot.client.name} to reach ${phase} year ${String(year)}`,
      ),
    ),
  );
}
