/**
 * npm run simulate - a complete game played by robots, with the checks a human
 * could not do by eye.
 *
 * It starts a real server in this process on a random port with a temporary data
 * folder, joins one terminal per country and one instructor, and lets the
 * instructor bot press only the suggested button until the game ends. Then it
 * prints a table per world and checks four things that must always hold:
 *
 *   1. exactly one outcome per country per year,
 *   2. each country's cumulative profit equals the sum of its years,
 *   3. every stored price matches a fresh calculation from the engine,
 *   4. no team ever received anything belonging to another world,
 *   5. the debrief matches a fresh calculation, and matches the debrief built
 *      by replaying events.jsonl from the beginning.
 *
 * Any failure exits non-zero, so npm run verify catches it.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../src/server/index.js';
import { applyEvent, createInitialState } from '../src/server/session/apply.js';
import { readEvents, sessionDir } from '../src/server/store/files.js';
import { debriefFor } from '../src/shared/debrief.js';
import { cooperativeMax } from '../src/shared/engine/engine.js';
import { COUNTRY_LETTERS, COUNTRY_NAMES } from '../src/shared/constants.js';
import { effectiveA, priceCents } from '../src/shared/engine/engine.js';
import { economicUnits, PRESET_NAMES, type PresetName } from '../src/shared/settings.js';
import type { SessionState } from '../src/shared/state.js';
import { formatPrice, formatProfitK, formatQuantity } from '../src/shared/units.js';
import type { CreateSessionResult } from '../src/shared/protocol.js';
import { InstructorBot } from '../tests/bots/instructorBot.js';
import { STRATEGIES, TeamBot, type Strategy } from '../tests/bots/teamBot.js';
import { GameClient } from '../tests/support/client.js';

interface Options {
  worlds: number;
  preset: PresetName;
  strategies: Strategy[];
}

function parseOptions(argv: string[]): Options {
  const get = (name: string): string | undefined => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit?.slice(name.length + 3);
  };

  const worlds = Number(get('worlds') ?? 3);
  const preset = (get('preset') ?? 'standard-75') as PresetName;
  const strategies = (
    get('strategies') ?? 'cooperative,competitive,cheater,titForTat,lateSubmitter,flaky,random'
  )
    .split(',')
    .map((name) => name.trim())
    .filter((name): name is Strategy => (STRATEGIES as readonly string[]).includes(name));

  if (!Number.isInteger(worlds) || worlds < 1 || worlds > 6) {
    throw new Error('--worlds has to be a whole number from 1 to 6.');
  }
  if (!PRESET_NAMES.includes(preset)) {
    throw new Error(`--preset has to be one of ${PRESET_NAMES.join(', ')}.`);
  }
  if (strategies.length === 0) throw new Error('--strategies named nothing I know.');

  return { worlds, preset, strategies };
}

const problems: string[] = [];
const check = (ok: boolean, message: string): void => {
  if (!ok) problems.push(message);
};

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const dataDir = await mkdtemp(join(tmpdir(), 'crude-accord-sim-'));

  const server = await createServer({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    // No automatic tick: the instructor bot decides when a year ends, so the
    // run is as fast as the machine allows and never races a deadline.
    tickMs: 0,
    clientDir: join(dataDir, 'no-client'),
    logger: () => undefined,
  });
  const url = `http://127.0.0.1:${String(server.port)}`;

  const bots: TeamBot[] = [];
  let instructor: InstructorBot | null = null;

  try {
    const setup = new GameClient(url, 'setup');
    await setup.hello({ role: 'setup' });
    const ack = await setup.send('createSession', {
      preset: options.preset,
      settings: { worlds: options.worlds },
    });
    if (!ack.ok) throw new Error(`createSession failed: ${ack.message}`);
    const session = ack.result as CreateSessionResult;
    setup.close();

    instructor = new InstructorBot(url, session.sessionId, session.instructorKey);
    await instructor.join();

    for (const [index, team] of session.teams.entries()) {
      const strategy = options.strategies[index % options.strategies.length] ?? 'cooperative';
      const bot = new TeamBot({
        url,
        sessionId: session.sessionId,
        joinCode: team.joinCode,
        strategy,
        name: `${team.teamId}:${strategy}`,
        seed: index + 1,
      });
      await bot.join();
      bots.push(bot);
    }

    await playGame(instructor, bots);

    const state = server.store.get(session.sessionId);
    if (!state) throw new Error('The session disappeared before the results could be read.');

    printResults(state, bots);
    checkOutcomes(state);
    checkCoverage(state, instructor);
    checkPrivacy(state, bots);
    await checkDebrief(state, dataDir);
  } finally {
    for (const bot of bots) bot.close();
    instructor?.close();
    await server.close();
    await rm(dataDir, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    console.error(`\n${String(problems.length)} problem(s) found:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('\nSimulation passed every check.');
}

// ---------------------------------------------------------------------------
// Playing.
// ---------------------------------------------------------------------------

/** How many button presses a game may take before something is clearly stuck. */
const MAX_STEPS = 400;

async function playGame(instructor: InstructorBot, bots: TeamBot[]): Promise<void> {
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const phase = instructor.phase;

    if (phase === 'PRACTICE_OPEN' || phase === 'YEAR_OPEN') {
      await waitAllAt(bots, phase, instructor.year);
      for (const bot of bots) {
        const ack = await bot.playOpenYear();
        if (!ack.ok) throw new Error(`${bot.client.name} could not submit: ${ack.message}`);
      }
    }

    if (phase === 'BETWEEN') {
      await waitAllAt(bots, phase, instructor.year);
      for (const bot of bots) await bot.talk();
    }

    if (phase === 'ENDED') {
      await waitAllAt(bots, phase, instructor.year);
      for (const bot of bots) await bot.reflect();
    }

    const ack = await instructor.step();
    if (!ack) return;
    if (!ack.ok) throw new Error(`The instructor bot was stopped: ${ack.message}`);
    await instructor.client.waitForView(
      (view) => (view['version'] as number) >= ack.version,
      'the dashboard to catch up',
    );
  }
  throw new Error('The game did not finish in a sensible number of steps.');
}

async function waitAllAt(bots: TeamBot[], phase: string, year: number): Promise<void> {
  await Promise.all(
    bots.map((bot) =>
      bot.client.waitForView(
        (view) => view['phase'] === phase && view['year'] === year,
        `${bot.client.name} to reach ${phase} year ${String(year)}`,
      ),
    ),
  );
}

// ---------------------------------------------------------------------------
// The table.
// ---------------------------------------------------------------------------

function printResults(state: SessionState, bots: TeamBot[]): void {
  const strategyOf = new Map(bots.map((bot) => [bot.teamId ?? '', bot.strategy]));

  for (const world of state.worlds) {
    console.log(`\nWorld ${String(world.worldNumber)}`);
    const header = [
      pad('Year', 6),
      pad('Price', 10),
      ...COUNTRY_LETTERS.map((letter) => pad(`${COUNTRY_NAMES[letter]} Q`, 12)),
      ...COUNTRY_LETTERS.map((letter) => pad(`${COUNTRY_NAMES[letter]} profit`, 16)),
    ].join(' ');
    console.log(header);
    console.log('-'.repeat(header.length));

    const rows = world.practice ? [world.practice, ...world.years] : world.years;
    for (const record of rows) {
      console.log(
        [
          pad(record.isPractice ? 'PRAC' : String(record.year), 6),
          pad(formatPrice(record.outcome.priceCents), 10),
          ...COUNTRY_LETTERS.map((letter) =>
            pad(
              `${formatQuantity(record.outcome.countries[letter].actualTenths)}${record.outcome.countries[letter].auto ? ' auto' : ''}`,
              12,
            ),
          ),
          ...COUNTRY_LETTERS.map((letter) =>
            pad(formatProfitK(record.outcome.countries[letter].profitK), 16),
          ),
        ].join(' '),
      );
    }

    const totals = COUNTRY_LETTERS.map((letter) =>
      world.years.reduce((sum, record) => sum + record.outcome.countries[letter].profitK, 0),
    );
    console.log(
      [
        pad('TOTAL', 6),
        pad('', 10),
        ...COUNTRY_LETTERS.map((letter) =>
          pad(strategyOf.get(`${world.worldId}-${letter}`) ?? '', 12),
        ),
        ...totals.map((total) => pad(formatProfitK(total), 16)),
      ].join(' '),
    );
  }
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length);
}

// ---------------------------------------------------------------------------
// The checks.
// ---------------------------------------------------------------------------

function checkOutcomes(state: SessionState): void {
  const units = economicUnits(state.settings);

  for (const world of state.worlds) {
    const seen = new Set<number>();
    for (const record of world.years) {
      check(
        !seen.has(record.year),
        `World ${String(world.worldNumber)} has Year ${String(record.year)} more than once.`,
      );
      seen.add(record.year);

      const letters = Object.keys(record.outcome.countries).sort().join('');
      check(
        letters === 'ABC',
        `World ${String(world.worldNumber)} Year ${String(record.year)} has outcomes for "${letters}" instead of ABC.`,
      );

      const total =
        COUNTRY_LETTERS.reduce(
          (sum, letter) => sum + record.outcome.countries[letter].actualTenths,
          0,
        ) + record.outcome.newProducerTenths;
      check(
        total === record.outcome.totalTenths,
        `World ${String(world.worldNumber)} Year ${String(record.year)} total is ${String(record.outcome.totalTenths)} but the countries add up to ${String(total)}.`,
      );

      const fresh = priceCents(total, effectiveA(record.year, state.settings), units.bHundredths);
      check(
        fresh === record.outcome.priceCents,
        `World ${String(world.worldNumber)} Year ${String(record.year)} stored ${formatPrice(record.outcome.priceCents)} but the engine says ${formatPrice(fresh)}.`,
      );
    }

    check(
      world.years.length === state.settings.years,
      `World ${String(world.worldNumber)} played ${String(world.years.length)} years, not ${String(state.settings.years)}.`,
    );

    for (const letter of COUNTRY_LETTERS) {
      const sum = world.years.reduce(
        (total, record) => total + record.outcome.countries[letter].profitK,
        0,
      );
      const withPractice = world.practice
        ? sum + world.practice.outcome.countries[letter].profitK
        : sum;
      check(
        sum !== withPractice || world.practice === null,
        `World ${String(world.worldNumber)} ${COUNTRY_NAMES[letter]} seems to have counted the practice year.`,
      );
    }
  }
}

/**
 * A complete game has to have been a complete game: the practice year, both
 * kinds of between-years activity, the new producer and the final-year warning.
 * Without this a passing run could have skipped half the features.
 */
function checkCoverage(state: SessionState, instructor: InstructorBot): void {
  check(state.phase === 'ENDED', `The game finished in ${state.phase}, not ENDED.`);
  check(state.resultsRevealedToTeams, 'Results were never released to the teams.');
  check(
    state.worlds.every((world) => world.practice !== null),
    'Some world never played the practice year.',
  );
  check(
    state.activitiesDone.some((key) => key.endsWith(':chat')),
    'No chat window was ever opened.',
  );
  check(
    state.activitiesDone.some((key) => key.endsWith(':summit')),
    'No summit was ever held.',
  );
  check(state.finalYearAnnounced, 'The final year was never announced.');
  check(
    state.worlds.every((world) =>
      world.years.some((record) => record.outcome.newProducerTenths > 0),
    ),
    'The new producer never entered any world.',
  );
  check(
    Object.values(state.teams).every((team) => team.reflection !== null),
    'Some team never wrote a reflection.',
  );
  check(instructor.steps.length > 0, 'The instructor bot never pressed anything.');
}

/**
 * The debrief, twice over.
 *
 * First against arithmetic done here, so a wrong total cannot hide behind the
 * same function that produced it. Then against the debrief built by replaying
 * events.jsonl from the first event, which is what a teacher would see after
 * the server was restarted: SPEC section 9 promises the replay is identical, so
 * the two debriefs have to be identical too.
 */
async function checkDebrief(state: SessionState, dataDir: string): Promise<void> {
  const debrief = debriefFor(state);

  for (const world of state.worlds) {
    const shown = debrief.worlds.find((item) => item.worldNumber === world.worldNumber);
    if (!shown) {
      problems.push(`The debrief has no World ${String(world.worldNumber)}.`);
      continue;
    }

    let joint = 0;
    let best = 0;
    for (const record of world.years) {
      joint += COUNTRY_LETTERS.reduce(
        (sum, letter) => sum + record.outcome.countries[letter].profitK,
        0,
      );
      best += cooperativeMax(state.settings, record.year).jointMaxK;
    }
    check(
      shown.totalProfitK === joint,
      `World ${String(world.worldNumber)}: the debrief says ${formatProfitK(shown.totalProfitK)} but the years add up to ${formatProfitK(joint)}.`,
    );
    check(
      shown.cooperativeMaxK === best,
      `World ${String(world.worldNumber)}: the debrief's benchmark is ${formatProfitK(shown.cooperativeMaxK)} but the engine says ${formatProfitK(best)}.`,
    );
    const percent = best === 0 ? 0 : Math.round((joint * 100) / best);
    check(
      Math.abs(shown.percentOfMax - percent) <= 1,
      `World ${String(world.worldNumber)}: the debrief says ${String(shown.percentOfMax)}% of the cooperative maximum, not ${String(percent)}%.`,
    );

    for (const letter of COUNTRY_LETTERS) {
      const own = world.years.reduce(
        (sum, record) => sum + record.outcome.countries[letter].profitK,
        0,
      );
      const row = shown.countries.find((country) => country.letter === letter);
      check(
        row?.cumulativeProfitK === own,
        `World ${String(world.worldNumber)} ${COUNTRY_NAMES[letter]}: the debrief says ${formatProfitK(row?.cumulativeProfitK ?? 0)}, the years add up to ${formatProfitK(own)}.`,
      );
    }
  }

  const replayed = await replayFromLog(state.sessionId, dataDir);
  if (replayed === null) {
    problems.push('The event log could not be replayed.');
    return;
  }
  check(
    JSON.stringify(debriefFor(replayed)) === JSON.stringify(debrief),
    'The debrief built by replaying events.jsonl is not the one the dashboard shows.',
  );
}

/** Rebuilds a session from its event log alone, the way a restart would. */
async function replayFromLog(sessionId: string, dataDir: string): Promise<SessionState | null> {
  const { events } = await readEvents(sessionDir(dataDir, sessionId), () => undefined);
  let state: SessionState | null = null;
  for (const event of events) {
    if (state === null) {
      const created = createInitialState(event);
      if (created.ok) state = created.state;
      continue;
    }
    const result = applyEvent(state, event);
    if (result.state) state = result.state;
  }
  return state;
}

/**
 * Searches every payload a team ever received for anything that belongs to a
 * different world: its id, its teams' ids, its join codes and its messages.
 */
function checkPrivacy(state: SessionState, bots: TeamBot[]): void {
  const allCodes = new Map<string, string>();
  for (const team of Object.values(state.teams)) allCodes.set(team.joinCode, team.teamId);

  for (const bot of bots) {
    const teamId = bot.teamId;
    if (teamId === null) continue;
    const team = state.teams[teamId];
    if (!team) continue;

    const forbidden = new Set<string>();
    for (const world of state.worlds) {
      if (world.worldId === team.worldId) continue;
      forbidden.add(world.worldId);
      for (const letter of COUNTRY_LETTERS) forbidden.add(`${world.worldId}-${letter}`);
    }
    for (const [code, owner] of allCodes) {
      if (owner !== teamId) forbidden.add(code);
    }
    forbidden.add(state.instructorKey);
    forbidden.add(state.projectorKey);
    for (const other of Object.values(state.teams)) {
      if (other.teamId !== teamId && other.token) forbidden.add(other.token);
    }

    const haystack = JSON.stringify(bot.client.views);
    for (const needle of forbidden) {
      if (needle.length < 4) continue;
      check(
        !haystack.includes(needle),
        `${bot.client.name} was sent "${needle}", which belongs to someone else.`,
      );
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
