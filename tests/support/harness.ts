/**
 * Starting a real server for a test: a random port, a temporary data folder and
 * a clock the test drives.
 *
 * Why a real server rather than calling the store directly: the rules that
 * matter most here (permissions, who gets which view, reconnecting) live in the
 * socket layer, and only a real socket exercises them.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type RunningServer } from '../../src/server/index.js';
import type { Clock } from '../../src/server/store/index.js';
import { type CreateSessionResult, type Hello } from '../../src/shared/protocol.js';
import type { PresetName, SettingsInput } from '../../src/shared/settings.js';
import { GameClient, nextCommandId, type GameClientOptions } from './client.js';

/** A clock the test moves by hand, so a 15-second wait takes no time at all. */
export class TestClock implements Clock {
  constructor(private current = 1_700_000_000_000) {}
  now(): number {
    return this.current;
  }
  advance(ms: number): void {
    this.current += ms;
  }
  set(ms: number): void {
    this.current = ms;
  }
}

export interface HarnessOptions {
  preset?: PresetName;
  settings?: SettingsInput;
  /** Leave the automatic 1-second tick off, so the test decides when it runs. */
  tickMs?: number;
  dataDir?: string;
  clock?: TestClock;
}

export interface Harness {
  server: RunningServer;
  clock: TestClock;
  dataDir: string;
  warnings: string[];
  url: string;
  /** Opens a socket and says hello. */
  client(name: string, hello: Hello, options?: GameClientOptions): Promise<GameClient>;
  /** Closes every client and the server, keeping the data folder. */
  stop(): Promise<void>;
  /** Closes the server and removes the data folder. */
  cleanup(): Promise<void>;
  track(client: GameClient): GameClient;
}

export async function startServer(options: HarnessOptions = {}): Promise<Harness> {
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'crude-accord-')));
  const clock = options.clock ?? new TestClock();
  const warnings: string[] = [];

  const server = await createServer({
    port: 0,
    host: '127.0.0.1',
    dataDir,
    clock,
    tickMs: options.tickMs ?? 0,
    logger: (message) => warnings.push(message),
    clientDir: join(dataDir, 'no-client'),
  });

  const url = `http://127.0.0.1:${String(server.port)}`;
  const clients: GameClient[] = [];

  const harness: Harness = {
    server,
    clock,
    dataDir,
    warnings,
    url,
    track(client) {
      clients.push(client);
      return client;
    },
    async client(name, hello, options = {}) {
      const client = new GameClient(url, name, options);
      clients.push(client);
      const result = await client.hello(hello);
      if (!result.ok) throw new Error(`${name} could not say hello: ${result.message}`);
      return client;
    },
    async stop() {
      for (const client of clients.splice(0)) client.close();
      await server.close();
    },
    async cleanup() {
      await harness.stop();
      await rm(dataDir, { recursive: true, force: true });
    },
  };

  return harness;
}

export interface Session {
  sessionId: string;
  instructorKey: string;
  projectorKey: string;
  teams: CreateSessionResult['teams'];
  instructor: GameClient;
}

/** Starts a session and leaves the instructor connected to it. */
export async function newSession(
  harness: Harness,
  options: { preset?: PresetName; settings?: SettingsInput; client?: GameClientOptions } = {},
): Promise<Session> {
  const setup = new GameClient(harness.url, 'setup', options.client ?? {});
  harness.track(setup);
  await setup.hello({ role: 'setup' });

  const ack = await setup.send('createSession', {
    preset: options.preset ?? 'standard-75',
    settings: options.settings ?? {},
  });
  if (!ack.ok) throw new Error(`createSession failed: ${ack.message}`);
  const result = ack.result as CreateSessionResult;
  setup.close();

  const instructor = await harness.client(
    'instructor',
    {
      role: 'instructor',
      sessionId: result.sessionId,
      instructorKey: result.instructorKey,
    },
    options.client ?? {},
  );

  return { ...result, instructor };
}

/** Connects a terminal and claims one country with its join code. */
export async function claim(
  harness: Harness,
  sessionId: string,
  joinCode: string,
  name: string,
  options: GameClientOptions = {},
): Promise<GameClient> {
  const client = await harness.client(name, { role: 'team', sessionId }, options);
  const ack = await client.send('claimTeam', { joinCode });
  if (!ack.ok) throw new Error(`${name} could not claim ${joinCode}: ${ack.message}`);
  const result = ack.result as { teamId: string; token: string };
  client.teamId = result.teamId;
  client.token = result.token;
  return client;
}

/** A commandId a test can reuse to prove a repeat applies only once. */
export const sameId = nextCommandId;
