/**
 * A thin socket.io client for tests, bots and the simulation.
 *
 * It does three things the raw client does not: it fills in a commandId and the
 * expectedPhase / expectedYear guards from the last view it received, it keeps
 * every payload the server ever sent (which the visibility tests search), and
 * it turns emits with an ack into promises.
 */

import { io, type Socket } from 'socket.io-client';
import {
  CLIENT_EVENTS,
  COMMAND_META,
  SERVER_EVENTS,
  type Ack,
  type ClaimTeamResult,
  type CommandType,
  type GoneMessage,
  type Hello,
  type HelloAck,
  type ViewMessage,
} from '../../src/shared/protocol.js';
import type { Phase } from '../../src/shared/state.js';

let counter = 0;

/** Unique, long enough for the schema, and readable in a failure message. */
export function nextCommandId(label = 'cmd'): string {
  counter += 1;
  return `${label}-${String(counter).padStart(6, '0')}-${String(Date.now() % 1000000)}`;
}

export interface SendOptions {
  commandId?: string;
  expectedPhase?: Phase;
  expectedYear?: number;
  /** Leaves the guards off even for a guarded command, to test the rejection. */
  noGuards?: boolean;
}

const ACK_TIMEOUT_MS = 10000;

export interface GameClientOptions {
  /**
   * Which transports socket.io may use. The default is websocket alone, which
   * is what a classroom gets; the restricted-network tests pass ['polling'] to
   * play a year the way a school that blocks WebSocket would (acceptance C4).
   */
  transports?: Array<'websocket' | 'polling'>;
  /**
   * How many view messages to keep. Unlimited by default, because the privacy
   * scan searches every payload a client was ever sent. The load test sets a
   * small number so the measurement is of the server's memory and not the
   * test's own (acceptance C3).
   */
  maxViews?: number;
}

export class GameClient {
  readonly socket: Socket;
  /** Every view message, exactly as it arrived. The visibility tests read this. */
  readonly views: ViewMessage[] = [];
  readonly gone: GoneMessage[] = [];
  readonly claimed: ClaimTeamResult[] = [];
  /** How many views have arrived, counted even when they are not all kept. */
  viewCount = 0;
  teamId: string | null = null;
  /** The terminal token, kept so a flaky bot can come back as itself. */
  token: string | null = null;
  sessionId: string | null = null;
  private readonly maxViews: number;

  constructor(
    url: string,
    readonly name = 'client',
    options: GameClientOptions = {},
  ) {
    this.maxViews = options.maxViews ?? Number.POSITIVE_INFINITY;
    this.socket = io(url, {
      transports: options.transports ?? ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    this.socket.on(SERVER_EVENTS.view, (message: ViewMessage) => {
      this.viewCount += 1;
      this.views.push(message);
      while (this.views.length > this.maxViews) this.views.shift();
    });
    this.socket.on(SERVER_EVENTS.gone, (message: GoneMessage) => {
      this.gone.push(message);
    });
    this.socket.on(SERVER_EVENTS.claimed, (message: ClaimTeamResult) => {
      this.claimed.push(message);
      this.teamId = message.teamId;
      this.token = message.token;
    });
  }

  /** The most recent view, loosely typed because each role gets a different one. */
  get view(): Record<string, unknown> {
    const last = this.views[this.views.length - 1];
    return (last?.view ?? {}) as Record<string, unknown>;
  }

  get phase(): Phase {
    return (this.view['phase'] as Phase | undefined) ?? 'LOBBY';
  }

  get year(): number {
    return (this.view['year'] as number | undefined) ?? 0;
  }

  async connect(): Promise<void> {
    if (this.socket.connected) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.name} could not connect.`)), 10000);
      this.socket.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once('connect_error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
      this.socket.connect();
    });
  }

  async hello(hello: Hello): Promise<HelloAck> {
    await this.connect();
    const result = await this.emit<HelloAck>(CLIENT_EVENTS.hello, hello);
    if (result.ok) {
      this.sessionId = result.sessionId;
      this.teamId = result.teamId;
    }
    return result;
  }

  async send(type: CommandType, payload: unknown = {}, options: SendOptions = {}): Promise<Ack> {
    const meta = COMMAND_META[type];
    const command: Record<string, unknown> = {
      commandId: options.commandId ?? nextCommandId(type),
      type,
      payload,
    };
    if (!options.noGuards && (meta.guarded || options.expectedPhase !== undefined)) {
      command['expectedPhase'] = options.expectedPhase ?? this.phase;
      command['expectedYear'] = options.expectedYear ?? this.year;
    }
    return this.emit<Ack>(CLIENT_EVENTS.command, command);
  }

  /**
   * Sends a command and waits until this client has seen the result.
   *
   * Tests use this rather than send() whenever the next step depends on the
   * new phase or year, because the guards are filled in from the last view.
   */
  async act(type: CommandType, payload: unknown = {}, options: SendOptions = {}): Promise<Ack> {
    const ack = await this.send(type, payload, options);
    if (ack.ok) {
      await this.waitForView(
        (view) => (view['version'] as number) >= ack.version,
        `${type} to take effect`,
      );
    }
    return ack;
  }

  /** act(), but a rejection is a test failure rather than something to assert. */
  async must(type: CommandType, payload: unknown = {}, options: SendOptions = {}): Promise<Ack> {
    const ack = await this.act(type, payload, options);
    if (!ack.ok) throw new Error(`${this.name}: ${type} was refused: ${ack.code} ${ack.message}`);
    return ack;
  }

  /** Sends something the schema should reject, exactly as given. */
  async sendRaw(raw: unknown): Promise<Ack> {
    return this.emit<Ack>(CLIENT_EVENTS.command, raw);
  }

  private emit<T>(event: string, payload: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.name}: no answer to ${event} in time.`)),
        ACK_TIMEOUT_MS,
      );
      this.socket.emit(event, payload, (reply: T) => {
        clearTimeout(timer);
        resolve(reply);
      });
    });
  }

  /** Waits until a view satisfies the test, or gives up with a clear message. */
  async waitForView(
    predicate: (view: Record<string, unknown>) => boolean,
    what = 'the view to change',
    timeoutMs = 5000,
  ): Promise<Record<string, unknown>> {
    if (predicate(this.view)) return this.view;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.off(SERVER_EVENTS.view, onView);
        reject(new Error(`${this.name}: gave up waiting for ${what}.`));
      }, timeoutMs);
      const onView = (message: ViewMessage) => {
        const view = message.view as Record<string, unknown>;
        if (!predicate(view)) return;
        clearTimeout(timer);
        this.socket.off(SERVER_EVENTS.view, onView);
        resolve(view);
      };
      this.socket.on(SERVER_EVENTS.view, onView);
    });
  }

  /**
   * Waits for anything at all, by polling.
   *
   * waitForView only wakes up when a view arrives, which is no use for the
   * messages that come instead of a view: "gone" and "claimed".
   */
  async waitUntil(predicate: () => boolean, what: string, timeoutMs = 5000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (!predicate()) {
      if (Date.now() > until) throw new Error(`${this.name}: gave up waiting for ${what}.`);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  disconnect(): void {
    this.socket.disconnect();
  }

  close(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket.close();
  }
}
