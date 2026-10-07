/**
 * The built server, run as a child process so a test can kill it.
 *
 * The end-to-end suite has to prove two things that need the server to be a
 * separate process: that killing it mid-year and starting it again restores the
 * lesson (R6), and that the browsers reconnect by themselves when it comes back
 * (F2). A server started inside the test process could not be killed that way.
 *
 * Each GameServer gets its own data folder and its own port, so two runs never
 * see each other's sessions (N3).
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyEvent, createInitialState } from '../../../src/server/session/apply.js';
import { readEvents, readSnapshot, sessionDir } from '../../../src/server/store/files.js';
import type { SessionState } from '../../../src/shared/state.js';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ENTRY = join(REPO_ROOT, 'dist', 'server', 'index.js');

/** A port nothing is listening on, asked for from the operating system. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

export class GameServer {
  private child: ChildProcess | null = null;
  /** Anything the server printed, so a test can quote it in a failure. */
  readonly output: string[] = [];

  private constructor(
    readonly dataDir: string,
    readonly port: number,
  ) {}

  get url(): string {
    return `http://127.0.0.1:${String(this.port)}`;
  }

  /** Starts a server on a fresh data folder. */
  static async start(): Promise<GameServer> {
    const dataDir = await mkdtemp(join(tmpdir(), 'crude-accord-e2e-'));
    const server = new GameServer(dataDir, await freePort());
    await server.spawn();
    return server;
  }

  private async spawn(): Promise<void> {
    const child = spawn(process.execPath, [ENTRY], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(this.port),
        DATA_DIR: this.dataDir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;

    const keep = (chunk: Buffer) => {
      this.output.push(chunk.toString());
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);

    await this.waitUntilHealthy();
  }

  /** Waits for /api/health, which is the server saying it is ready. */
  private async waitUntilHealthy(timeoutMs = 30_000): Promise<void> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      if (this.child?.exitCode !== null && this.child?.exitCode !== undefined) {
        throw new Error(`The server stopped at once:\n${this.output.join('')}`);
      }
      try {
        const response = await fetch(`${this.url}/api/health`);
        if (response.ok) return;
      } catch {
        // Not up yet.
      }
      if (Date.now() > until) {
        throw new Error(`The server never answered /api/health:\n${this.output.join('')}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /** Stops the process the way a power cut would: no graceful shutdown. */
  async kill(): Promise<void> {
    const child = this.child;
    this.child = null;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.kill('SIGKILL');
      // Windows does not really have SIGKILL; the kill above still ends it, but
      // give it a moment either way.
      setTimeout(resolve, 5000);
    });
  }

  /** Kills it and starts it again on the same port and the same data folder. */
  async restart(): Promise<void> {
    await this.kill();
    await this.spawn();
  }

  /** Stops it and removes the data folder. */
  async cleanup(): Promise<void> {
    await this.kill();
    await rm(this.dataDir, { recursive: true, force: true });
  }

  /**
   * The saved state of one session, rebuilt off disk.
   *
   * This is how the privacy scan (I1) gets at the keys, the join codes and the
   * terminal tokens without the server having to hand them over.
   *
   * It is the snapshot plus the events that came after it, which is exactly
   * what the server itself does on startup - and it has to be, because a
   * snapshot is only written at a phase change (SPEC section 9), so the
   * snapshot alone would be out of date for anything that happened since.
   */
  async savedState(sessionId: string): Promise<SessionState> {
    const dir = sessionDir(this.dataDir, sessionId);
    const quiet = () => undefined;
    const snapshot = await readSnapshot(dir, quiet);
    const { events } = await readEvents(dir, quiet);

    let state: SessionState | null = snapshot;
    for (const event of events) {
      if (state !== null && event.seq <= state.seq) continue;
      if (state === null) {
        const created = createInitialState(event);
        if (created.ok) state = created.state;
        continue;
      }
      const result = applyEvent(state, event);
      if (result.state) state = result.state;
    }
    if (state === null) throw new Error(`There is nothing saved for session ${sessionId}.`);
    return state;
  }

  /** Downloads one export file with the instructor key. */
  async exportFile(sessionId: string, name: string, instructorKey: string): Promise<string> {
    const url = `${this.url}/api/sessions/${sessionId}/export/${name}?k=${encodeURIComponent(instructorKey)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${name} came back ${String(response.status)}`);
    return response.text();
  }
}
