/**
 * The session store: the only road from a command to saved, committed state.
 *
 * The order never changes (CLAUDE.md rule 5 and SPEC section 9):
 *   validate and permission-check -> compute a candidate state -> append the
 *   event to events.jsonl and fsync -> commit the candidate -> ack -> broadcast.
 *
 * Everything for one session runs through one promise chain, so two instructor
 * screens clicking at the same instant are handled one after the other and the
 * second one sees the first one's result.
 */

import { COUNTRY_LETTERS, MAX_WORLDS } from '../../shared/constants.js';
import {
  ackFail,
  ackOk,
  ACK_CODES,
  COMMAND_META,
  type Ack,
  type AckCode,
  type Command,
  type CreateSessionResult,
} from '../../shared/protocol.js';
import type { Actor, SessionState } from '../../shared/state.js';
import {
  applyEvent,
  createInitialState,
  everyoneSubmitted,
  isTimedPhase,
  type Issued,
  type SessionEvent,
} from '../session/apply.js';
import {
  newId,
  newInstructorKey,
  newJoinCodes,
  newProjectorKey,
  newSessionId,
  newSessionSeed,
  newTerminalToken,
} from '../ids.js';
import {
  EventLog,
  ensureSessionDir,
  listSessionIds,
  readEvents,
  readSnapshot,
  removeSession,
  sessionDir,
  writeSnapshot,
  type Logger,
} from './files.js';

/** A clock the tests can drive. The real one is just Date.now. */
export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export interface StoreOptions {
  dataDir: string;
  clock?: Clock;
  logger?: Logger;
}

/** What the socket layer knows that the reducer does not. */
export interface CommandContext {
  actor: Actor;
  /** The team that sent it, for team commands. */
  actorId?: string | null;
  /** How long this team's terminal has been offline, or null when connected. */
  terminalOfflineMs?: number | null;
}

export type ChangeKind = 'updated' | 'deleted';
export type ChangeListener = (sessionId: string, kind: ChangeKind) => void;

interface LiveSession {
  state: SessionState;
  log: EventLog;
  dir: string;
  /** Everything for this session queues here, so commands never interleave. */
  queue: Promise<unknown>;
}

const EMPTY_ACK_MESSAGE = 'Something went wrong saving that. Nothing was changed.';

/** How many createSession acks are remembered for idempotency. */
const MAX_REMEMBERED_CREATES = 200;

export class SessionStore {
  private readonly sessions = new Map<string, LiveSession>();
  private readonly listeners = new Set<ChangeListener>();
  /** createSession has no session to remember its ack in, so it lives here. */
  private readonly created = new Map<string, CreateSessionResult>();
  readonly clock: Clock;
  private readonly logger: Logger;
  private readonly dataDir: string;

  constructor(options: StoreOptions) {
    this.dataDir = options.dataDir;
    this.clock = options.clock ?? systemClock;
    this.logger = options.logger ?? ((message) => console.warn(message));
  }

  /** Where a warning goes. The socket layer shares the store's logger. */
  log(message: string): void {
    this.logger(message);
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private announce(sessionId: string, kind: ChangeKind): void {
    for (const listener of this.listeners) listener(sessionId, kind);
  }

  sessionIds(): string[] {
    return [...this.sessions.keys()];
  }

  get(sessionId: string): SessionState | undefined {
    return this.sessions.get(sessionId)?.state;
  }

  // -------------------------------------------------------------------------
  // Loading what is already on disk.
  // -------------------------------------------------------------------------

  /**
   * Rebuilds every saved session: the snapshot first, then the events that came
   * after it, using the timestamps stored in those events so the result is
   * exactly the state the class ended with.
   */
  async loadAll(): Promise<void> {
    for (const sessionId of await listSessionIds(this.dataDir)) {
      try {
        await this.loadOne(sessionId);
      } catch (err) {
        this.logger(`Could not load session ${sessionId}: ${String(err)}`);
      }
    }
  }

  private async loadOne(sessionId: string): Promise<void> {
    const dir = sessionDir(this.dataDir, sessionId);
    const snapshot = await readSnapshot(dir, this.logger);
    const { events } = await readEvents(dir, this.logger);

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
      else if (!result.ok) {
        // A command that was rejected when it was sent is rejected again now.
        this.logger(`Replay of ${sessionId} skipped ${event.command.type}: ${result.message}`);
      }
    }

    if (state === null) return;
    if (events.some((event) => event.command.type === 'deleteSession')) return;

    // A phase that was running when the server stopped comes back paused, with
    // the time it had left (SPEC section 9). The deadline is compared with the
    // last saved event, never with the clock, so this is the same on every load.
    if (isTimedPhase(state.phase) && !state.timer.paused && state.timer.deadline !== null) {
      state.timer = {
        deadline: null,
        paused: true,
        remainingMs: Math.max(0, state.timer.deadline - state.updatedAt),
        seconds: state.timer.seconds,
        restarted: true,
      };
    }

    this.sessions.set(sessionId, {
      state,
      log: new EventLog(dir, this.logger),
      dir,
      queue: Promise.resolve(),
    });
  }

  // -------------------------------------------------------------------------
  // createSession.
  // -------------------------------------------------------------------------

  async create(command: Command): Promise<Ack> {
    if (command.type !== 'createSession') {
      return ackFail(command.commandId, 'INVALID', 'That is not a createSession command.');
    }

    const already = this.created.get(command.commandId);
    if (already) return ackOk(command.commandId, 1, already);
    // createSession has no session state to keep its ack in, so it is kept here
    // instead. A server left running all term must not grow for ever, and only
    // a click repeated within one lesson could ever ask for an old answer.
    if (this.created.size >= MAX_REMEMBERED_CREATES) {
      const oldest = this.created.keys().next();
      if (!oldest.done) this.created.delete(oldest.value);
    }

    const sessionId = newSessionId();
    const event: SessionEvent = {
      seq: 1,
      at: this.clock.now(),
      actor: 'instructor',
      actorId: null,
      command,
      issued: {
        sessionId,
        seed: newSessionSeed(),
        instructorKey: newInstructorKey(),
        projectorKey: newProjectorKey(),
        codes: newJoinCodes(MAX_WORLDS * COUNTRY_LETTERS.length),
      },
    };

    const created = createInitialState(event);
    if (!created.ok) return ackFail(command.commandId, created.code, created.message);

    const dir = await ensureSessionDir(this.dataDir, sessionId);
    const log = new EventLog(dir, this.logger);
    try {
      await log.append(event);
      await writeSnapshot(dir, created.state);
    } catch (err) {
      this.logger(`Could not start session ${sessionId}: ${String(err)}`);
      await log.close();
      return ackFail(command.commandId, 'STORAGE', EMPTY_ACK_MESSAGE);
    }

    this.sessions.set(sessionId, { state: created.state, log, dir, queue: Promise.resolve() });
    this.created.set(command.commandId, created.result as CreateSessionResult);
    this.announce(sessionId, 'updated');
    return ackOk(command.commandId, created.state.version, created.result);
  }

  // -------------------------------------------------------------------------
  // Everything else.
  // -------------------------------------------------------------------------

  /** Queues one command for one session and waits for its ack. */
  async handle(sessionId: string, command: Command, context: CommandContext): Promise<Ack> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return ackFail(command.commandId, 'NOT_FOUND', 'That session is not open on this computer.');
    }
    return this.enqueue(session, () => this.applyOne(sessionId, session, command, context));
  }

  private enqueue<T>(session: LiveSession, work: () => Promise<T>): Promise<T> {
    const next = session.queue.then(work, work);
    // The chain must never reject, or every later command would be dropped.
    session.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async applyOne(
    sessionId: string,
    session: LiveSession,
    command: Command,
    context: CommandContext,
  ): Promise<Ack> {
    const meta = COMMAND_META[command.type];
    const before = session.state;

    // A repeated commandId gives back the first answer and changes nothing.
    const remembered = before.results[command.commandId];
    if (remembered) {
      return remembered.ok
        ? ackOk(command.commandId, remembered.version, remembered.result)
        : ackFail(
            command.commandId,
            asAckCode(remembered.code),
            remembered.message ?? EMPTY_ACK_MESSAGE,
          );
    }

    const now = this.clock.now();

    // ping changes nothing, so it is never written to disk.
    if (!meta.persisted) {
      if (!meta.actors.includes(context.actor)) {
        return ackFail(command.commandId, 'NOT_ALLOWED', 'That is not allowed from this screen.');
      }
      return ackOk(command.commandId, before.version, { serverNow: now });
    }

    const event: SessionEvent = {
      seq: before.seq + 1,
      at: now,
      actor: context.actor,
      actorId: context.actorId ?? null,
      command,
      issued: issuedFor(command, context),
    };

    const result = applyEvent(before, event);
    const candidate = result.state;
    if (!candidate) {
      return result.ok
        ? ackOk(command.commandId, before.version)
        : ackFail(command.commandId, result.code, result.message);
    }

    try {
      await session.log.append(event);
    } catch (err) {
      this.logger(`Could not save ${command.type} for ${sessionId}: ${String(err)}`);
      return ackFail(
        command.commandId,
        'STORAGE',
        'That could not be saved, so nothing was changed. Please try again.',
      );
    }

    session.state = candidate;

    // A snapshot at every phase change keeps the replay after a crash short.
    if (candidate.phase !== before.phase) {
      try {
        await writeSnapshot(session.dir, candidate);
      } catch (err) {
        this.logger(`Could not write the snapshot for ${sessionId}: ${String(err)}`);
      }
    }

    if (command.type === 'deleteSession') {
      await session.log.close();
      this.sessions.delete(sessionId);
      try {
        await removeSession(this.dataDir, sessionId);
      } catch (err) {
        this.logger(`Could not remove the folder for ${sessionId}: ${String(err)}`);
      }
      this.announce(sessionId, 'deleted');
      return ackOk(command.commandId, candidate.version);
    }

    this.announce(sessionId, 'updated');

    // autoClose: the moment every country in every world has submitted, the
    // year closes itself. It goes through the same path, so it is saved too.
    if (
      result.ok &&
      command.type === 'submitDecision' &&
      candidate.settings.autoClose &&
      everyoneSubmitted(candidate)
    ) {
      await this.applyOne(
        sessionId,
        session,
        {
          commandId: newId(),
          type: 'closeYear',
          payload: {},
          expectedPhase: candidate.phase,
          expectedYear: candidate.year,
        },
        { actor: 'system' },
      );
    }

    return result.ok
      ? ackOk(command.commandId, candidate.version, result.result)
      : ackFail(command.commandId, result.code, result.message);
  }

  // -------------------------------------------------------------------------
  // The 1-second tick.
  // -------------------------------------------------------------------------

  /**
   * Closes anything whose deadline has passed.
   *
   * The closing is done by ordinary commands with actor "system", so an
   * automatic close is saved to events.jsonl exactly like a click would be.
   */
  async tick(): Promise<void> {
    const now = this.clock.now();
    for (const [sessionId, session] of this.sessions) {
      const state = session.state;
      if (!isTimedPhase(state.phase)) continue;
      if (state.timer.paused || state.timer.deadline === null) continue;
      if (now < state.timer.deadline) continue;

      const type = state.phase === 'BETWEEN' ? 'endBetween' : 'closeYear';
      // The tick runs from a setInterval, so one session that throws must never
      // become an unhandled rejection and must never stop the other sessions.
      try {
        await this.enqueue(session, () =>
          this.applyOne(
            sessionId,
            session,
            {
              commandId: newId(),
              type,
              payload: {},
              expectedPhase: session.state.phase,
              expectedYear: session.state.year,
            },
            { actor: 'system' },
          ),
        );
      } catch (err) {
        this.logger(`The clock could not close ${state.phase} for ${sessionId}: ${String(err)}`);
      }
    }
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) {
      await session.queue.catch(() => undefined);
      await session.log.close();
    }
    this.sessions.clear();
  }
}

/** A saved ack code, checked on the way back out of a snapshot. */
function asAckCode(code: string | undefined): AckCode {
  return ACK_CODES.includes(code as AckCode) ? (code as AckCode) : 'INVALID';
}

/** The server-generated values each command needs, and nothing more. */
function issuedFor(command: Command, context: CommandContext): Issued {
  switch (command.type) {
    case 'updateSettings':
      return { codes: newJoinCodes(MAX_WORLDS * COUNTRY_LETTERS.length) };
    case 'claimTeam':
      return {
        token: newTerminalToken(),
        requestId: newId(),
        terminalOfflineMs: context.terminalOfflineMs ?? null,
      };
    default:
      // Four is enough for the busiest command (openYear can add two news
      // items) with room to spare.
      return { ids: [newId(), newId(), newId(), newId()] };
  }
}
