/**
 * npm run loadtest - acceptance C3: a full class, three times the size of one.
 *
 * It opens more than fifty connections to one server at once:
 *   6 worlds of 3 countries  = 18 terminals
 *   2 instructor screens     (a laptop and a tablet, as a teacher might)
 *   3 projectors             (a hall with three screens)
 *   the rest                 network-check clients, the /check page on every
 *                            spare computer in the room
 * and plays a complete game through them, with every terminal dropping off the
 * network and coming back three times on the way.
 *
 * Then it checks the four things in the pass criterion:
 *   1. no decision was lost - every number a terminal sent is the number stored,
 *   2. no message was lost,
 *   3. 95% of acks came back in under 300 ms (SPEC section 9),
 *   4. the server's heap grew by less than 50 MB over the whole game.
 *
 * Any failure exits non-zero, so npm run verify catches it.
 *
 * The timers are turned right up rather than left at test-fast's five seconds.
 * That is deliberate: the measurement is about fifty screens arriving at once,
 * and a five-second clock closing a year under eighteen terminals would fill in
 * decisions automatically and make "nothing was lost" impossible to state.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.js';
import { MESSAGE_GAP_MS } from '../src/server/session/apply.js';
import { COUNTRY_LETTERS } from '../src/shared/constants.js';
import type { CreateSessionResult } from '../src/shared/protocol.js';
import { PRESETS } from '../src/shared/settings.js';
import type { SessionState } from '../src/shared/state.js';
import { GameClient } from '../tests/support/client.js';

// --- the pass criterion, in one place --------------------------------------

const WORLDS = 6;
const TERMINALS = WORLDS * COUNTRY_LETTERS.length;
const INSTRUCTOR_SCREENS = 2;
const PROJECTORS = 3;
/** At least fifty connections, as the criterion says. */
const MIN_CONNECTIONS = 50;
const CHECK_CLIENTS = Math.max(0, MIN_CONNECTIONS - TERMINALS - INSTRUCTOR_SCREENS - PROJECTORS);
/** How many times each terminal drops off the network and comes back. */
const RECONNECTS_EACH = 3;
const ACK_BUDGET_MS = 300;
const ACK_PERCENTILE = 0.95;
const HEAP_BUDGET_BYTES = 50 * 1024 * 1024;

/** The game: test-fast's schedule and years, with timers a class could use. */
const YEARS = PRESETS['test-fast'].years;
const SCHEDULE = PRESETS['test-fast'].schedule;

const problems: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) problems.push(message);
};

const latencies: number[] = [];

/**
 * Times one command and keeps the measurement.
 *
 * The instructor's commands go through act() rather than send(), which waits
 * for this screen's own next view. That matters: the expectedPhase and
 * expectedYear guards are filled in from the last view the screen received, so
 * a second command sent before that view arrives would be refused as stale -
 * exactly as it should be, and exactly what a real dashboard avoids by drawing
 * the new phase before offering the next button.
 */
async function timed(
  what: string,
  run: () => Promise<{ ok: boolean; message?: string; code?: string }>,
): Promise<boolean> {
  const at = Date.now();
  const ack = await run();
  latencies.push(Date.now() - at);
  if (!ack.ok) problems.push(`${what} was refused: ${ack.code ?? '?'} ${ack.message ?? ''}`);
  return ack.ok;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[index] ?? 0;
}

/** heapUsed after a collection, when the runtime will give us one. */
function heapNow(): number {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (gc) {
    gc();
    gc();
  }
  return process.memoryUsage().heapUsed;
}

interface Terminal {
  client: GameClient;
  teamId: string;
  letter: string;
  worldNumber: number;
  joinCode: string;
  /** What this terminal sent, year by year. The record of truth for the check. */
  sent: Map<number, number>;
  messagesSent: string[];
  /** When this team last sent a message, for the one-every-three-seconds rule. */
  lastMessageAt: number | null;
  reconnects: number;
}

async function main(): Promise<void> {
  const dataDir = await mkdtemp(join(tmpdir(), 'crude-accord-load-'));
  const server = await createServer({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    // No client folder: this test drives sockets, not a browser.
    clientDir: join(dataDir, 'no-client'),
    logger: (message) => {
      problems.push(`the server warned: ${message}`);
    },
  });
  const url = `http://127.0.0.1:${String(server.port)}`;
  const open: GameClient[] = [];

  const closeEverything = () => {
    for (const client of open.splice(0)) client.close();
  };

  try {
    // --- the session --------------------------------------------------------

    const setup = new GameClient(url, 'setup', { maxViews: 2 });
    open.push(setup);
    await setup.hello({ role: 'setup' });
    const created = await setup.send('createSession', {
      preset: 'test-fast',
      settings: {
        worlds: WORLDS,
        // See the note at the top: long timers, so nothing closes itself.
        timers: { practiceSeconds: 900, earlyYearSeconds: 900, laterYearSeconds: 900 },
      },
    });
    if (!created.ok) throw new Error(`createSession failed: ${created.message}`);
    const session = created.result as CreateSessionResult;
    setup.close();
    open.splice(open.indexOf(setup), 1);

    console.log(
      `Load test: ${String(TERMINALS)} terminals, ${String(INSTRUCTOR_SCREENS)} dashboards, ` +
        `${String(PROJECTORS)} projectors, ${String(CHECK_CLIENTS)} network checks ` +
        `(${String(TERMINALS + INSTRUCTOR_SCREENS + PROJECTORS + CHECK_CLIENTS)} connections), ` +
        `${String(YEARS)} years.`,
    );

    // --- everybody arrives in the same instant ------------------------------

    const arrivedAt = Date.now();

    const terminalJoins = session.teams.map(async (team): Promise<Terminal> => {
      // A small view cap, so what this process holds is the server's memory
      // and not a growing pile of the test's own copies.
      const client = new GameClient(url, team.teamId, { maxViews: 3 });
      open.push(client);
      const hello = await client.hello({ role: 'team', sessionId: session.sessionId });
      if (!hello.ok) throw new Error(`${team.teamId}: ${hello.message}`);
      const ack = await client.send('claimTeam', { joinCode: team.joinCode });
      if (!ack.ok) throw new Error(`${team.teamId} could not claim: ${ack.message}`);
      const result = ack.result as { teamId: string; token: string };
      client.teamId = result.teamId;
      client.token = result.token;
      await client.send('setMembers', { names: ['Ada', 'Ben', 'Cleo'] });
      return {
        client,
        teamId: team.teamId,
        letter: team.letter,
        worldNumber: team.worldNumber,
        joinCode: team.joinCode,
        sent: new Map(),
        messagesSent: [],
        lastMessageAt: null,
        reconnects: 0,
      };
    });

    const dashboardJoins = Array.from({ length: INSTRUCTOR_SCREENS }, async (_, index) => {
      const client = new GameClient(url, `dashboard-${String(index + 1)}`, { maxViews: 3 });
      open.push(client);
      const hello = await client.hello({
        role: 'instructor',
        sessionId: session.sessionId,
        instructorKey: session.instructorKey,
      });
      if (!hello.ok) throw new Error(`dashboard ${String(index + 1)}: ${hello.message}`);
      return client;
    });

    const projectorJoins = Array.from({ length: PROJECTORS }, async (_, index) => {
      const client = new GameClient(url, `projector-${String(index + 1)}`, { maxViews: 3 });
      open.push(client);
      const hello = await client.hello({
        role: 'projector',
        sessionId: session.sessionId,
        projectorKey: session.projectorKey,
      });
      if (!hello.ok) throw new Error(`projector ${String(index + 1)}: ${hello.message}`);
      return client;
    });

    const checkJoins = Array.from({ length: CHECK_CLIENTS }, async (_, index) => {
      const client = new GameClient(url, `check-${String(index + 1)}`, { maxViews: 2 });
      open.push(client);
      const hello = await client.hello({ role: 'check', sessionId: session.sessionId });
      if (!hello.ok) throw new Error(`check ${String(index + 1)}: ${hello.message}`);
      return client;
    });

    const [terminals, dashboards, projectors, checks] = await Promise.all([
      Promise.all(terminalJoins),
      Promise.all(dashboardJoins),
      Promise.all(projectorJoins),
      Promise.all(checkJoins),
    ]);

    const connections = terminals.length + dashboards.length + projectors.length + checks.length;
    console.log(`Everyone connected in ${String(Date.now() - arrivedAt)} ms.`);
    check(
      connections >= MIN_CONNECTIONS,
      `only ${String(connections)} connections, and the criterion asks for ${String(MIN_CONNECTIONS)}`,
    );

    const instructor = dashboards[0];
    if (!instructor) throw new Error('no dashboard');

    /** Waits until every terminal has caught up with the dashboard. */
    const settle = async (): Promise<void> => {
      const target = (instructor.view['version'] as number | undefined) ?? 0;
      await Promise.all(
        [...dashboards.slice(1), ...projectors].map((client) =>
          client.waitForView(
            (view) => (view['version'] as number) >= target,
            `${client.name} to reach version ${String(target)}`,
            20_000,
          ),
        ),
      );
      await Promise.all(
        terminals
          .filter((terminal) => terminal.client.socket.connected)
          .map((terminal) =>
            terminal.client.waitForView(
              (view) => (view['version'] as number) >= target,
              `${terminal.teamId} to reach version ${String(target)}`,
              20_000,
            ),
          ),
      );
    };

    // The network checks report their round trip, which is what puts
    // "Network check: n of n OK" on the dashboard.
    await Promise.all(
      checks.map(async (client, index) => {
        const at = Date.now();
        const pong = await client.send('ping');
        latencies.push(Date.now() - at);
        if (!pong.ok) problems.push(`a network check could not ping: ${pong.message}`);
        return client.send('report', {
          clientId: `check-${String(index + 1)}`,
          rttMs: Math.max(1, Date.now() - at),
          transport: 'websocket',
        });
      }),
    );

    // --- the briefing and the practice year ---------------------------------

    await timed('setBriefingSlide', () => instructor.act('setBriefingSlide', { slide: 0 }));
    await settle();
    await timed('startPractice', () => instructor.act('startPractice'));
    await settle();

    for (const terminal of terminals) {
      await timed(`${terminal.teamId} practice`, () =>
        terminal.client.send('submitDecision', { tenths: 383 }),
      );
    }
    await timed('closeYear (practice)', () => instructor.act('closeYear'));
    await settle();

    /** When each terminal takes its turn at dropping off the network. */
    const dropYears = [2, Math.ceil(YEARS / 2), YEARS - 1].slice(0, RECONNECTS_EACH);
    let messagesExpected = 0;
    let heapWarm = 0;

    for (let year = 1; year <= YEARS; year += 1) {
      await timed(`openYear ${String(year)}`, () => instructor.act('openYear', { year }));
      await settle();

      // Every terminal takes a turn offline during the years in dropYears, the
      // whole lot of them at once, which is the worst case: a room where the
      // access point hiccups.
      if (dropYears.includes(year)) {
        await Promise.all(
          terminals.map(async (terminal) => {
            terminal.client.disconnect();
            await terminal.client.connect();
            const hello = await terminal.client.hello({
              role: 'team',
              sessionId: session.sessionId,
              ...(terminal.client.token ? { teamToken: terminal.client.token } : {}),
            });
            if (!hello.ok) {
              problems.push(`${terminal.teamId} could not come back: ${hello.message}`);
              return;
            }
            if (hello.needsClaim) {
              problems.push(`${terminal.teamId} was sent back to the join screen after a drop`);
              return;
            }
            terminal.reconnects += 1;
            await terminal.client.waitForView(
              (view) => view['kind'] === 'team' && view['year'] === year,
              `${terminal.teamId} to catch up after coming back (last view ${JSON.stringify(terminal.client.view['kind'])} year ${JSON.stringify(terminal.client.view['year'])})`,
              20_000,
            );
          }),
        );
      }

      // All eighteen submit at the same instant, with a number that is theirs
      // alone, so a decision stored against the wrong country cannot hide.
      await Promise.all(
        terminals.map(async (terminal, index) => {
          const tenths = 200 + year * 7 + index;
          const at = Date.now();
          const ack = await terminal.client.send('submitDecision', { tenths });
          latencies.push(Date.now() - at);
          if (!ack.ok) {
            problems.push(`${terminal.teamId} lost Year ${String(year)}: ${ack.message}`);
            return;
          }
          terminal.sent.set(year, tenths);
        }),
      );

      await timed(`closeYear ${String(year)}`, () => instructor.act('closeYear'));
      await settle();

      if (year === 1) heapWarm = heapNow();

      // The final-year warning, where the schedule asks for it.
      if (year + 1 === YEARS) {
        await timed('announceFinalYear', () => instructor.act('announceFinalYear'));
        await settle();
      }

      // A summit, or a messaging window, if the schedule has one after this
      // year. A messaging window is a switch the teacher throws rather than a
      // phase the room moves into (SPEC 8.4), so the two are driven differently.
      const activity = SCHEDULE.find((row) => row.afterYear === year);
      if (activity?.kind === 'summit') {
        await timed('startBetween', () =>
          instructor.act('startBetween', { kind: 'summit', seconds: 600 }),
        );
        await settle();
        await timed('endBetween', () => instructor.act('endBetween'));
        await settle();
      }
      if (activity?.kind === 'chat') {
        await timed('setMessaging on', () =>
          instructor.act('setMessaging', { on: true, seconds: 600 }),
        );
        await settle();
        for (const terminal of terminals) {
          // One message per three seconds per team (SPEC section 6). A real
          // messaging window is minutes long, so a group never meets the limit;
          // this game is played in a few seconds, so the test has to wait it
          // out rather than count a correct refusal as a lost message.
          await waitForMessageGap(terminal);
          const text = `${terminal.teamId} in year ${String(year)}: we will keep to the deal.`;
          const at = Date.now();
          const ack = await terminal.client.send('sendMessage', { text });
          latencies.push(Date.now() - at);
          if (ack.ok) {
            terminal.messagesSent.push(text);
            terminal.lastMessageAt = Date.now();
            messagesExpected += 1;
          } else {
            problems.push(`${terminal.teamId} lost a message: ${ack.code} ${ack.message}`);
          }
        }
        await timed('setMessaging off', () => instructor.act('setMessaging', { on: false }));
        await settle();
      }
    }

    await timed('endGame', () => instructor.act('endGame'));
    await settle();
    await timed('revealResultsToTeams', () => instructor.act('revealResultsToTeams'));
    await settle();

    for (const terminal of terminals) {
      await timed(`${terminal.teamId} reflection`, () =>
        terminal.client.send('submitReflection', {
          answers: ['We kept to it.', 'One promise broke.', 'Agree a number first.'],
        }),
      );
    }

    const heapEnd = heapNow();

    // --- the four checks ----------------------------------------------------

    const state = server.store.get(session.sessionId);
    if (!state) throw new Error('the session went missing');

    checkNoDecisionLost(state, terminals);
    checkNoMessageLost(state, terminals, messagesExpected);

    for (const terminal of terminals) {
      check(
        terminal.reconnects === RECONNECTS_EACH,
        `${terminal.teamId} came back ${String(terminal.reconnects)} times, not ${String(RECONNECTS_EACH)}`,
      );
    }

    const p95 = percentile(latencies, ACK_PERCENTILE);
    check(
      p95 < ACK_BUDGET_MS,
      `the 95th percentile ack was ${String(p95)} ms over ${String(latencies.length)} commands, and the budget is ${String(ACK_BUDGET_MS)} ms`,
    );

    const grew = heapEnd - heapWarm;
    check(
      grew < HEAP_BUDGET_BYTES,
      `the heap grew by ${mb(grew)} MB over the game, and the budget is ${mb(HEAP_BUDGET_BYTES)} MB`,
    );

    // --- the report ---------------------------------------------------------

    console.log('');
    console.log(`Connections            ${String(connections)}`);
    console.log(`Commands measured      ${String(latencies.length)}`);
    console.log(
      `Ack 50th / 95th / max  ${ms(percentile(latencies, 0.5))} / ${ms(p95)} / ${ms(Math.max(...latencies))}`,
    );
    console.log(
      `Decisions stored       ${String(countDecisions(state))} (${String(TERMINALS * YEARS)} expected)`,
    );
    console.log(
      `Messages stored        ${String(state.messages.length)} (${String(messagesExpected)} expected)`,
    );
    console.log(`Reconnects             ${String(terminals.length * RECONNECTS_EACH)}`);
    console.log(`Heap after Year 1      ${mb(heapWarm)} MB`);
    console.log(`Heap at the end        ${mb(heapEnd)} MB (grew ${mb(grew)} MB)`);
    console.log('');

    if (problems.length > 0) {
      console.error('The load test found problems:');
      for (const problem of problems) console.error(` - ${problem}`);
      process.exitCode = 1;
      return;
    }
    console.log('Load test passed.');
  } finally {
    closeEverything();
    await server.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

/** Every number a terminal sent is the number stored, for every year. */
function checkNoDecisionLost(state: SessionState, terminals: Terminal[]): void {
  for (const terminal of terminals) {
    const world = state.worlds.find((row) => row.worldNumber === terminal.worldNumber);
    if (!world) {
      problems.push(`world ${String(terminal.worldNumber)} is missing`);
      continue;
    }
    for (const [year, tenths] of terminal.sent) {
      const record = world.years.find((row) => row.year === year);
      const stored = record?.decisions[terminal.letter as 'A'];
      if (!stored) {
        problems.push(`${terminal.teamId} has no decision stored for Year ${String(year)}`);
        continue;
      }
      if (stored.tenths !== tenths) {
        problems.push(
          `${terminal.teamId} sent ${String(tenths)} in Year ${String(year)} and ${String(stored.tenths)} was stored`,
        );
      }
      if (stored.auto) {
        problems.push(`${terminal.teamId}'s Year ${String(year)} was filled in, but it did submit`);
      }
    }
  }
}

/** Every message a terminal sent is in the session, once, in its own world. */
function checkNoMessageLost(state: SessionState, terminals: Terminal[], expected: number): void {
  const chat = state.messages;
  if (chat.length !== expected) {
    problems.push(`${String(expected)} messages were sent and ${String(chat.length)} were stored`);
  }
  for (const terminal of terminals) {
    for (const text of terminal.messagesSent) {
      const found = chat.filter((message) => message.text === text);
      if (found.length !== 1) {
        problems.push(`a message from ${terminal.teamId} was stored ${String(found.length)} times`);
        continue;
      }
      if (found[0]?.worldId !== `world-${String(terminal.worldNumber)}`) {
        problems.push(`a message from ${terminal.teamId} landed in the wrong world`);
      }
    }
  }
}

function countDecisions(state: SessionState): number {
  let count = 0;
  for (const world of state.worlds) {
    for (const record of world.years) count += Object.keys(record.decisions).length;
  }
  return count;
}

/** Waits, if it has to, until this team is allowed to write again. */
async function waitForMessageGap(terminal: Terminal): Promise<void> {
  if (terminal.lastMessageAt === null) return;
  const waitMs = MESSAGE_GAP_MS - (Date.now() - terminal.lastMessageAt);
  if (waitMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, waitMs));
}

const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1);
const ms = (value: number): string => `${String(Math.round(value))} ms`;

main().catch((err: unknown) => {
  console.error('The load test could not run.');
  console.error(err);
  process.exit(1);
});
