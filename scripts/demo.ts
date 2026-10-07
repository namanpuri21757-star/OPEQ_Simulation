/**
 * npm run demo - a whole lesson on one computer, run from the real screens.
 *
 * Until the instructor screens existed this script had to be the teacher, with
 * four keys standing in for the dashboard. It does not any more: it starts a
 * server, makes a session, and prints the five links that let one person play
 * every part. The instructor window drives the game exactly as a teacher would.
 *
 * Nothing here is test-only. The links are the same links a classroom uses; the
 * only difference is that all the windows happen to be on one machine.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type RunningServer } from '../src/server/index.js';
import { COUNTRY_NAMES, MAX_WORLDS } from '../src/shared/constants.js';
import type { CreateSessionResult } from '../src/shared/protocol.js';
import {
  PRESETS,
  PRESET_NAMES,
  type PresetName,
  type SettingsInput,
} from '../src/shared/settings.js';
import { GameClient } from '../tests/support/client.js';

const CLIENT_DIR = fileURLToPath(new URL('../dist/client', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('../data/demo', import.meta.url));

function buildClient(): Promise<void> {
  console.log('Building the screens first. This happens once.\n');
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('npm run build failed, so the demo cannot start.')),
    );
  });
}

function inUse(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: string }).code === 'EADDRINUSE'
  );
}

/**
 * Starts on the first free port from the one asked for (SPEC section 9).
 *
 * A laptop that is already running something on 3000 is normal, and a teacher
 * halfway through a lesson should not have to know what a port is.
 */
async function listen(from: number): Promise<RunningServer> {
  for (let port = from; port < from + 10; port += 1) {
    try {
      return await createServer({
        port,
        host: '0.0.0.0',
        dataDir: DATA_DIR,
        clientDir: CLIENT_DIR,
        logger: (message) => {
          console.log(`[server] ${message}`);
        },
      });
    } catch (err) {
      if (!inUse(err)) throw err;
      console.log(`Port ${String(port)} is busy, trying the next one.`);
    }
  }
  throw new Error(`Nothing was free between ${String(from)} and ${String(from + 9)}.`);
}

/** Every address a tablet on the same Wi-Fi could use. */
function addresses(port: number): string[] {
  const out: string[] = [`http://localhost:${String(port)}`];
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        out.push(`http://${entry.address}:${String(port)}`);
      }
    }
  }
  return out;
}

/**
 * What a demo run was asked for.
 *
 * The defaults are a full standard lesson in one world. A short run is what
 * the debrief is usually wanted for: `npm run demo -- --preset=test-fast
 * --years=3` reaches the end in about two minutes, because the whole point of
 * test-fast is five-second years.
 */
export interface DemoOptions {
  preset: PresetName;
  worlds: number;
  /** Shortens the game, and trims the schedule and the new producer to fit. */
  years: number | null;
}

function flag(argv: string[], name: string): string | undefined {
  return argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function parseOptions(argv: string[]): DemoOptions {
  const preset = (flag(argv, 'preset') ?? 'standard-75') as PresetName;
  if (!PRESET_NAMES.includes(preset)) {
    throw new Error(`--preset has to be one of ${PRESET_NAMES.join(', ')}.`);
  }

  const worlds = Number(flag(argv, 'worlds') ?? 1);
  if (!Number.isInteger(worlds) || worlds < 1 || worlds > MAX_WORLDS) {
    throw new Error(`--worlds has to be a whole number from 1 to ${String(MAX_WORLDS)}.`);
  }

  const rawYears = flag(argv, 'years');
  if (rawYears === undefined) return { preset, worlds, years: null };
  const years = Number(rawYears);
  if (!Number.isInteger(years) || years < 1 || years > 40) {
    throw new Error('--years has to be a whole number from 1 to 40.');
  }
  return { preset, worlds, years };
}

/**
 * The settings patch for those options.
 *
 * A shorter game needs more than a smaller `years`: an activity after Year 10,
 * a new producer in Year 9 and the longer timer for Years 1 to 3 are all
 * refused by the settings rules once the game is three years long, so each one
 * is trimmed to fit rather than left to fail.
 */
function settingsFor(options: DemoOptions): SettingsInput {
  const base: SettingsInput = { worlds: options.worlds };
  const years = options.years;
  if (years === null) return base;

  const preset = PRESETS[options.preset];
  const np = preset.newProducer;
  return {
    ...base,
    years,
    timers: {
      ...preset.timers,
      earlyYearsThrough: Math.min(preset.timers.earlyYearsThrough, years),
    },
    schedule: preset.schedule.filter((item) => item.afterYear < years),
    newProducer: { ...np, enabled: np.enabled && np.year <= years },
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  if (!existsSync(join(CLIENT_DIR, 'index.html'))) await buildClient();

  const server = await listen(Number(process.env['PORT'] ?? 3000));
  const port = server.port;

  // One world keeps a solo run to three team windows. The instructor screen can
  // change every other setting before the briefing starts.
  const setup = new GameClient(server.url, 'demo-setup');
  await setup.hello({ role: 'setup' });
  const ack = await setup.send('createSession', {
    preset: options.preset,
    settings: settingsFor(options),
  });
  setup.close();
  if (!ack.ok) throw new Error(`The demo session could not be created: ${ack.message}`);
  const session = ack.result as CreateSessionResult;

  const urls = addresses(port);
  const base = urls[0] ?? `http://localhost:${String(port)}`;

  console.log('\nCrude Accord demo - one world, played from the real screens.\n');
  console.log('Open these in separate browser windows:\n');
  console.log('  Instructor (keep this one to yourself)');
  console.log(`    ${base}/instructor?s=${session.sessionId}&k=${session.instructorKey}\n`);
  console.log('  Projector (put it on the second screen, or just another window)');
  console.log(`    ${base}/projector/${session.sessionId}?k=${session.projectorKey}\n`);
  console.log('  Team computers (one window each)');
  for (const team of session.teams) {
    const name = COUNTRY_NAMES[team.letter];
    console.log(`    ${name} (${team.letter})  ${base}/join/${team.joinCode}`);
  }
  console.log('\n  Network check (any computer in the room)');
  console.log(`    ${base}/check`);

  if (urls.length > 1) {
    console.log(`\nOn a tablet on the same Wi-Fi, use ${urls[1] ?? ''} instead of localhost.`);
  }

  console.log('\nIn the instructor window, press the one big button to move the game on.');
  console.log(`Saved in ${DATA_DIR}`);
  console.log('\nPress Ctrl+C to stop. Everything played so far stays saved.\n');

  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    console.log(`\nGot ${signal}. Stopping, so nothing is half saved.`);
    server
      .close()
      .then(() => process.exit(0))
      .catch((err: unknown) => {
        console.error(err);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
