/**
 * Reading and writing the files under data/sessions/<sessionId>/ (SPEC 9).
 *
 * Two files per session:
 *   events.jsonl  - one accepted command per line, appended and fsynced before
 *                   anything is sent to a client, so a power cut can lose a
 *                   command but can never show a result that was not saved.
 *   snapshot.json - the whole state, written to a temporary file and renamed,
 *                   so a half-written snapshot can never exist.
 *
 * Nothing here knows what a session means; it only moves bytes.
 */

import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, writeFile, readdir } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { commandSchema, removedCommandMessage } from '../../shared/protocol.js';
import type { SessionState } from '../../shared/state.js';
import type { SessionEvent } from '../session/apply.js';
import { upgradeSnapshot } from './migrate.js';

export const EVENTS_FILE = 'events.jsonl';
export const SNAPSHOT_FILE = 'snapshot.json';

export type Logger = (message: string) => void;

export function sessionDir(dataDir: string, sessionId: string): string {
  return join(dataDir, 'sessions', sessionId);
}

export async function ensureSessionDir(dataDir: string, sessionId: string): Promise<string> {
  const dir = sessionDir(dataDir, sessionId);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** The session folders that exist, in a stable order. */
export async function listSessionIds(dataDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(dataDir, 'sessions'), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * An append-only log with the file handle held open.
 *
 * Why hold it open: a class with 18 terminals appends several times a second,
 * and opening and closing a file for each one costs more than it saves. The
 * handle is closed when the server stops.
 */
export class EventLog {
  private handle: FileHandle | null = null;

  constructor(
    private readonly dir: string,
    private readonly logger: Logger,
  ) {}

  private async file(): Promise<FileHandle> {
    if (this.handle) return this.handle;
    await mkdir(this.dir, { recursive: true });
    this.handle = await open(join(this.dir, EVENTS_FILE), 'a');
    return this.handle;
  }

  /**
   * Appends one event and waits for the disk to confirm it.
   *
   * Throws on any failure, which the store turns into a STORAGE ack while
   * keeping the old state (CLAUDE.md rule 5).
   */
  async append(event: SessionEvent): Promise<void> {
    const handle = await this.file();
    await handle.write(`${JSON.stringify(event)}\n`);
    await handle.sync();
  }

  async close(): Promise<void> {
    const handle = this.handle;
    this.handle = null;
    if (!handle) return;
    try {
      await handle.close();
    } catch (err) {
      this.logger(`Could not close the event log cleanly: ${String(err)}`);
    }
  }
}

/**
 * Reads back a log.
 *
 * A line that will not parse is skipped with a warning rather than throwing:
 * the usual cause is the last line of a file whose write was cut off by a power
 * cut, and losing that one command is much better than losing the lesson.
 */
export async function readEvents(
  dir: string,
  logger: Logger,
): Promise<{ events: SessionEvent[]; skipped: number }> {
  let raw: string;
  try {
    raw = await readFile(join(dir, EVENTS_FILE), 'utf8');
  } catch {
    return { events: [], skipped: 0 };
  }

  const events: SessionEvent[] = [];
  let skipped = 0;
  const lines = raw.split('\n');

  for (const [index, line] of lines.entries()) {
    if (line.trim() === '') continue;
    const parsed = parseEventLine(line);
    if (parsed) {
      events.push(parsed);
      continue;
    }
    // A v1 command for a feature that no longer exists is not damage, so it is
    // left out without a warning that would worry a teacher.
    if (isRemovedLine(line)) continue;
    skipped += 1;
    const where = index === lines.length - 1 ? 'last' : `line ${String(index + 1)} of the`;
    logger(
      `Skipped the ${where} saved command in ${dir}: it was not written completely. Everything before it was loaded.`,
    );
  }

  return { events, skipped };
}

/** A line that is a command v2 removed: skipped quietly, not reported as damage. */
function isRemovedLine(line: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return false;
  }
  if (typeof raw !== 'object' || raw === null) return false;
  const command = (raw as Record<string, unknown>)['command'];
  if (typeof command !== 'object' || command === null) return false;
  return removedCommandMessage((command as Record<string, unknown>)['type']) !== null;
}

function parseEventLine(line: string): SessionEvent | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;

  const row = raw as Record<string, unknown>;
  const command = commandSchema.safeParse(row['command']);
  if (!command.success) return null;
  if (typeof row['seq'] !== 'number' || typeof row['at'] !== 'number') return null;
  if (typeof row['actor'] !== 'string') return null;

  return {
    seq: row['seq'],
    at: row['at'],
    actor: row['actor'] as SessionEvent['actor'],
    actorId: typeof row['actorId'] === 'string' ? row['actorId'] : null,
    command: command.data,
    issued: (row['issued'] ?? {}) as SessionEvent['issued'],
  };
}

/** Writes the snapshot through a temporary file, so it is never half written. */
export async function writeSnapshot(dir: string, state: SessionState): Promise<void> {
  await mkdir(dir, { recursive: true });
  const body = JSON.stringify(state);
  // A unique temporary name, so two writes in flight cannot collide.
  const stamp = createHash('sha1')
    .update(`${String(state.seq)}:${body.length}`)
    .digest('hex')
    .slice(0, 8);
  const tmp = join(dir, `${SNAPSHOT_FILE}.${stamp}.tmp`);
  await writeFile(tmp, body, 'utf8');
  const handle = await open(tmp, 'r+');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, join(dir, SNAPSHOT_FILE));
}

/** The saved state, or null when there is none or it cannot be read. */
export async function readSnapshot(dir: string, logger: Logger): Promise<SessionState | null> {
  try {
    const raw = await readFile(join(dir, SNAPSHOT_FILE), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    // Everything a v1 session saved that v2 has no field for is dropped here,
    // so a lesson from before the update still opens (see migrate.ts).
    return upgradeSnapshot(parsed);
  } catch {
    // Deliberately not logging the error: a JSON parse error quotes the text
    // around the problem, and a snapshot's text holds the instructor key
    // (SPEC section 9, keys). The folder is enough to find the file.
    logger(`No usable snapshot in ${dir}. Rebuilding from the saved commands.`);
    return null;
  }
}

export async function removeSession(dataDir: string, sessionId: string): Promise<void> {
  await rm(sessionDir(dataDir, sessionId), { recursive: true, force: true });
}
