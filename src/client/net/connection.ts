/**
 * One socket, looked after properly.
 *
 * This is the only file in the client that talks to the server. It owns:
 *  - saying hello and presenting the terminal's saved token,
 *  - reconnecting on its own and saying hello again,
 *  - the server-time offset, so a countdown shows the server's clock and not
 *    the school laptop's (SPEC section 9),
 *  - an outbox: a command that has not been answered yet is sent again after a
 *    reconnect with the SAME commandId, which the server treats as a repeat and
 *    never applies twice (SPEC section 9, idempotency).
 *
 * It is deliberately free of React so the integration test can drive it against
 * a real server in plain Node. The React part is in ConnectionProvider.tsx.
 */

import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  COMMAND_META,
  SERVER_EVENTS,
  type Ack,
  type ClaimTeamResult,
  type CommandInput,
  type CommandType,
  type GoneMessage,
  type Hello,
  type HelloAck,
  type ViewMessage,
} from '@shared/protocol';
import type { Phase } from '@shared/state';
import {
  browserStore,
  clearTerminal,
  readTerminal,
  writeTerminal,
  type KeyValueStore,
} from './storage';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'refused';

/** The payload a command takes as a client writes it, before zod fills defaults. */
export type PayloadInputOf<T extends CommandType> = Extract<CommandInput, { type: T }>['payload'];

export interface SendOptions {
  /** Reuse an id to repeat a command on purpose. A repeat changes nothing. */
  commandId?: string;
  expectedPhase?: Phase;
  expectedYear?: number;
}

export type SendCommand = <T extends CommandType>(
  type: T,
  payload: PayloadInputOf<T>,
  options?: SendOptions,
) => Promise<Ack>;

/** Everything a screen needs to know about the connection, in one object. */
export interface ConnectionSnapshot {
  status: ConnectionStatus;
  /** The latest view. Its shape depends on this client's role. */
  view: unknown;
  version: number;
  /** True when the server wants this terminal to claim a country first. */
  needsClaim: boolean;
  teamId: string | null;
  /** Set when this screen has lost its place: taken over, released, deleted. */
  gone: GoneMessage | null;
  /** A sentence to show when hello was refused. */
  problem: string | null;
  /** The result of a takeover the instructor has just approved. */
  claimed: ClaimTeamResult | null;
  /** How many commands are waiting for an answer. */
  pending: number;
}

export interface ConnectionOptions {
  /** Empty for the "setup" role, which exists before any session does. */
  sessionId: string;
  role: 'setup' | 'team' | 'instructor' | 'projector' | 'check';
  /** The instructor key or the projector key. Teams use a token instead. */
  key?: string;
  /** Left out in a browser, where the socket goes back to where the page came from. */
  url?: string;
  store?: KeyValueStore;
}

interface Waiting {
  commandId: string;
  command: Record<string, unknown>;
  settle(ack: Ack): void;
  /** True once the server has answered, so a flush never sends it twice. */
  done: boolean;
}

let counter = 0;

/** Unique, 8 to 64 characters, and readable in a server log. */
export function makeCommandId(type: string): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `${type}-${Date.now().toString(36)}-${String(counter)}-${random}`;
}

/** How long to wait before trying again after the other end hung up. */
const RETRY_MS = 1000;

const EMPTY: ConnectionSnapshot = {
  status: 'connecting',
  view: null,
  version: 0,
  needsClaim: false,
  teamId: null,
  gone: null,
  problem: null,
  claimed: null,
  pending: 0,
};

export class Connection {
  private socket: Socket | null = null;
  private snapshot: ConnectionSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private outbox = new Map<string, Waiting>();
  /** serverNow minus this computer's clock, in milliseconds. */
  private offsetMs = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly store: KeyValueStore;

  constructor(private readonly options: ConnectionOptions) {
    this.store = options.store ?? browserStore();
  }

  // --- what React subscribes to -------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ConnectionSnapshot => this.snapshot;

  private update(change: Partial<ConnectionSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change };
    for (const listener of this.listeners) listener();
  }

  /** The server's clock, as well as this computer can work it out. */
  serverNow(): number {
    return Date.now() + this.offsetMs;
  }

  get sessionId(): string {
    return this.options.sessionId;
  }

  /**
   * How socket.io is actually carrying this connection (SPEC 8.6).
   *
   * Some school networks block plain WebSocket, in which case socket.io falls
   * back to polling and everything still works, just a little slower. The check
   * page reports which one it got, because "polling on nine laptops" is
   * something a teacher would want to know before a lesson rather than during
   * one.
   */
  transport(): 'websocket' | 'polling' | 'unknown' {
    const name = this.socket?.io.engine?.transport?.name;
    return name === 'websocket' || name === 'polling' ? name : 'unknown';
  }

  // --- connecting ----------------------------------------------------------

  start(): void {
    if (this.socket) return;
    // forceNew keeps each Connection on its own manager: without it two of them
    // (a remount in development, or two in one test) would share a socket.
    const socket =
      this.options.url === undefined
        ? io({ forceNew: true })
        : io(this.options.url, { forceNew: true });
    this.socket = socket;

    socket.on('connect', () => {
      void this.sayHello();
    });
    socket.on('disconnect', () => {
      // Anything unanswered stays in the outbox and goes again, with its id,
      // once hello has succeeded.
      this.update({ status: 'offline' });
      // Socket.IO retries by itself when the network drops, but not when the
      // other end closed the socket deliberately - a server restart, say. A
      // classroom terminal always wants to come back, so it tries again itself.
      if (!socket.active) this.retryLater(socket);
    });
    socket.on('connect_error', () => {
      this.update({ status: 'offline' });
    });
    socket.on(SERVER_EVENTS.view, (message: ViewMessage) => {
      this.offsetMs = message.serverNow - Date.now();
      this.update({ view: message.view, version: message.version });
    });
    socket.on(SERVER_EVENTS.gone, (message: GoneMessage) => {
      clearTerminal(this.store);
      this.update({ gone: message, needsClaim: true, teamId: null });
    });
    socket.on(SERVER_EVENTS.claimed, (result: ClaimTeamResult) => {
      this.remember(result);
      this.update({ claimed: result, needsClaim: false, teamId: result.teamId, gone: null });
    });
  }

  stop(): void {
    const socket = this.socket;
    this.socket = null;
    if (this.retry !== null) clearTimeout(this.retry);
    this.retry = null;
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
  }

  private retryLater(socket: Socket): void {
    if (this.retry !== null) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.socket === socket && !socket.connected) socket.connect();
    }, RETRY_MS);
  }

  private hello(): Hello {
    const { role, sessionId, key } = this.options;
    if (role === 'setup') return { role };
    if (role === 'instructor') return { role, sessionId, instructorKey: key ?? '' };
    if (role === 'projector') return { role, sessionId, projectorKey: key ?? '' };
    const saved = readTerminal(this.store);
    const token = saved && saved.sessionId === sessionId ? saved.token : undefined;
    // The check page offers the token for one reason: so its result lands on
    // the right country's row in the lobby. It is still a "check" socket, so it
    // can only ping and report, and it never counts as that team's terminal.
    if (token === undefined) return { role, sessionId };
    return { role, sessionId, teamToken: token };
  }

  private async sayHello(): Promise<void> {
    const socket = this.socket;
    if (!socket) return;
    const sentAt = Date.now();
    let result: HelloAck;
    try {
      result = await emit<HelloAck>(socket, CLIENT_EVENTS.hello, this.hello());
    } catch {
      this.update({ status: 'offline' });
      return;
    }

    if (!result.ok) {
      // The session this computer remembers is not open any more - yesterday's
      // game, or the server restarted. Forget it, so looking again finds today's.
      clearTerminal(this.store);
      this.update({
        status: 'refused',
        problem: result.message,
        needsClaim: true,
        teamId: null,
      });
      return;
    }

    // Half the round trip is the best guess at how long the answer took to
    // arrive, so the offset is measured from the middle of the exchange.
    this.offsetMs = result.serverNow - (sentAt + Date.now()) / 2;
    // A rejected token means this computer is not that team any more.
    if (result.needsClaim) clearTerminal(this.store);

    this.update({
      status: 'online',
      problem: null,
      needsClaim: result.needsClaim,
      teamId: result.teamId,
    });
    this.flush();
  }

  // --- sending -------------------------------------------------------------

  /**
   * Sends a command and resolves with the server's ack.
   *
   * The commandId, expectedPhase and expectedYear are filled in here so no
   * screen has to remember them. The guards are taken from the view this client
   * is looking at, which is the whole point of them: a click made on a stale
   * screen is refused with STALE rather than applied to the wrong year.
   */
  sendCommand: SendCommand = <T extends CommandType>(
    type: T,
    payload: PayloadInputOf<T>,
    options: SendOptions = {},
  ): Promise<Ack> => {
    const commandId = options.commandId ?? makeCommandId(type);

    const existing = this.outbox.get(commandId);
    if (existing) {
      // The same id twice from one screen: let the first call own the answer.
      return new Promise<Ack>((resolve) => {
        const earlier = existing.settle;
        existing.settle = (ack) => {
          earlier(ack);
          resolve(ack);
        };
      });
    }

    const command: Record<string, unknown> = { commandId, type, payload };
    if (COMMAND_META[type].guarded) {
      command['expectedPhase'] = options.expectedPhase ?? this.viewPhase();
      command['expectedYear'] = options.expectedYear ?? this.viewYear();
    }

    return new Promise<Ack>((resolve) => {
      const waiting: Waiting = { commandId, command, settle: resolve, done: false };
      this.outbox.set(commandId, waiting);
      this.update({ pending: this.outbox.size });
      this.deliver(waiting);
    });
  };

  /** Sends one waiting command, if there is a live socket to send it on. */
  private deliver(waiting: Waiting): void {
    const socket = this.socket;
    if (!socket || !socket.connected || this.snapshot.status !== 'online') return;
    socket.emit(CLIENT_EVENTS.command, waiting.command, (ack: Ack) => {
      if (waiting.done) return;
      waiting.done = true;
      this.outbox.delete(waiting.commandId);
      this.update({ pending: this.outbox.size });
      waiting.settle(ack);
    });
  }

  /** After a reconnect: everything still unanswered, with its original id. */
  private flush(): void {
    for (const waiting of [...this.outbox.values()]) {
      if (!waiting.done) this.deliver(waiting);
    }
  }

  private viewPhase(): Phase {
    const view = this.snapshot.view as { phase?: Phase } | null;
    return view?.phase ?? 'LOBBY';
  }

  private viewYear(): number {
    const view = this.snapshot.view as { year?: number } | null;
    return view?.year ?? 0;
  }

  // --- claiming ------------------------------------------------------------

  /**
   * Keeps a claim result, so a reload comes back as the same country.
   *
   * It also clears needsClaim: that flag is the server's answer to hello, and a
   * claim is exactly the thing that answers it. Without this a terminal that had
   * just claimed would be sent back to the join screen by the next render.
   */
  remember(result: ClaimTeamResult): void {
    writeTerminal(this.store, {
      sessionId: this.options.sessionId,
      teamId: result.teamId,
      token: result.token,
      label: result.label,
    });
    this.update({ needsClaim: false, teamId: result.teamId, gone: null });
  }

  /** Forgets this computer's team, for "join again" after a takeover. */
  forget(): void {
    clearTerminal(this.store);
    this.update({ needsClaim: true, teamId: null, gone: null });
  }

  /** Clears a "gone" notice once the student has read it. */
  dismissGone(): void {
    this.update({ gone: null });
  }
}

function emit<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('No answer in time.')), 10000);
    socket.emit(event, payload, (reply: T) => {
      clearTimeout(timer);
      resolve(reply);
    });
  });
}
