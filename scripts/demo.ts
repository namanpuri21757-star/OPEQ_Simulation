/**
 * npm run demo - the team screens, for real, with a robot teacher you drive from
 * the keyboard.
 *
 * The instructor screens arrive in a later phase, so until then this script is
 * the teacher: it starts a one-world session, prints a join link for each of the
 * three countries, and turns four keys into the controls a teacher would have.
 *
 * Enter presses the same single suggested button the real dashboard will show
 * (nextSuggestedAction), so a demo run follows the same schedule a lesson will.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type RunningServer } from '../src/server/index.js';
import { COUNTRY_NAMES } from '../src/shared/constants.js';
import type { CreateSessionResult } from '../src/shared/protocol.js';
import { InstructorBot } from '../tests/bots/instructorBot.js';
import { GameClient } from '../tests/support/client.js';

const CLIENT_DIR = fileURLToPath(new URL('../dist/client', import.meta.url));
const DATA_DIR = fileURLToPath(new URL('../data/demo', import.meta.url));

function buildClient(): Promise<void> {
  console.log('Building the team screens first. This happens once.\n');
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

async function main(): Promise<void> {
  if (!existsSync(join(CLIENT_DIR, 'index.html'))) await buildClient();

  const server = await listen(Number(process.env['PORT'] ?? 3000));
  const port = server.port;

  const setup = new GameClient(server.url, 'demo-setup');
  await setup.hello({ role: 'setup' });
  const ack = await setup.send('createSession', {
    preset: 'standard-75',
    settings: { worlds: 1 },
  });
  setup.close();
  if (!ack.ok) throw new Error(`The demo session could not be created: ${ack.message}`);
  const session = ack.result as CreateSessionResult;

  const teacher = new InstructorBot(server.url, session.sessionId, session.instructorKey, 'demo');
  await teacher.join();

  const urls = addresses(port);
  const base = urls[0] ?? `http://localhost:${String(port)}`;
  console.log('\nCrude Accord demo - one world, three team computers.\n');
  console.log('Open one link in each of three separate browser windows:\n');
  for (const team of session.teams) {
    const name = COUNTRY_NAMES[team.letter];
    console.log(`  ${name} (${team.letter})  ${base}/join/${team.joinCode}`);
  }
  if (urls.length > 1) {
    console.log(`\nOn a tablet on the same Wi-Fi, use ${urls[1] ?? ''} instead of localhost.`);
  }
  console.log(`\nSaved in ${DATA_DIR}`);
  console.log('\nKeys:  Enter = next step    p = pause    r = resume    q = quit\n');

  let lastLine = '';
  const announce = (): void => {
    const suggested = teacher.suggested;
    const line = `${teacher.phase}${teacher.year > 0 ? ` (Year ${String(teacher.year)})` : ''} - next: ${suggested?.label ?? 'nothing'}`;
    if (line === lastLine) return;
    lastLine = line;
    console.log(`  ${line}`);
  };
  teacher.client.socket.on('view', announce);
  announce();

  const stop = (): void => {
    teacher.close();
    void server.close().then(() => process.exit(0));
  };

  const onKey = (key: string): void => {
    // \u0003 is Ctrl+C, which raw mode delivers as a key rather than a signal.
    if (key === 'q' || key === '\u0003') {
      console.log('\nStopping. Everything played so far is saved.');
      stop();
      return;
    }
    if (key === 'p') {
      void teacher.send('pause');
      return;
    }
    if (key === 'r') {
      void teacher.send('resume');
      return;
    }
    if (key === '\r' || key === '\n') {
      void teacher.step().then((result) => {
        if (result && !result.ok) console.log(`  Not now: ${result.message}`);
      });
    }
  };

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on('data', (chunk: string) => {
    for (const key of chunk) onKey(key);
  });
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
