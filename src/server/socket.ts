/**
 * The socket layer: who a connection is, what it may send, and what it is sent.
 *
 * It owns three things the store deliberately does not:
 *  - authentication (an instructor key, a projector key, a terminal token),
 *  - presence (who is connected and when they were last seen), which is not
 *    saved to disk because after a restart nobody is connected anyway,
 *  - sending each socket its own view after every change, at most ten times a
 *    second so a busy moment cannot flood a school laptop (SPEC section 9).
 *
 * Every socket is sent a view built for it alone. No socket ever receives raw
 * state, and no socket is in a shared room that could carry someone else's data.
 */

import type { Server as IoServer, Socket } from 'socket.io';
import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  ackFail,
  helloSchema,
  parseCommand,
  type Ack,
  type ClaimTeamResult,
  type GoneMessage,
  type Hello,
  type HelloAck,
  type HelloRole,
  type ViewMessage,
} from '../shared/protocol.js';
import { teamLabel } from '../shared/labels.js';
import type { Actor, SessionState } from '../shared/state.js';
import {
  viewForInstructor,
  viewForProjector,
  viewForTeam,
  viewForUnclaimedTeam,
} from '../shared/views.js';
import { nextSuggestedAction } from './session/suggest.js';
import type { SessionStore } from './store/index.js';

/** A socket may send this many commands in BURST_WINDOW_MS. */
const BURST_LIMIT = 120;
const BURST_WINDOW_MS = 10000;
/** At most ten view messages a second per socket (SPEC section 9). */
const VIEW_GAP_MS = 100;

const ACTOR_FOR_ROLE: Record<HelloRole, Actor> = {
  setup: 'instructor',
  instructor: 'instructor',
  projector: 'projector',
  team: 'team',
  check: 'check',
};

interface Client {
  socket: Socket;
  role: HelloRole | null;
  actor: Actor;
  sessionId: string | null;
  teamId: string | null;
  /** The terminal token this socket presented, so a takeover can be spotted. */
  token: string | null;
  /** A takeover this socket asked for and is waiting on. */
  waitingFor: { teamId: string; token: string } | null;
  /** When the last few commands arrived, for the burst limit. */
  recent: number[];
  lastViewAt: number;
  viewTimer: ReturnType<typeof setTimeout> | null;
  viewPending: boolean;
}

export interface Presence {
  connected: boolean;
  lastSeenAt: number | null;
}

export interface SocketLayer {
  /** Rebuilds and sends every view for a session. */
  broadcast(sessionId: string): void;
  presence(sessionId: string): Record<string, Presence>;
  close(): void;
}

export function attachSockets(io: IoServer, store: SessionStore): SocketLayer {
  const clients = new Map<string, Client>();
  /** sessionId -> teamId -> when that terminal was last seen. */
  const lastSeen = new Map<string, Map<string, number>>();

  const seenMap = (sessionId: string): Map<string, number> => {
    const found = lastSeen.get(sessionId);
    if (found) return found;
    const made = new Map<string, number>();
    lastSeen.set(sessionId, made);
    return made;
  };

  const clientsOf = (sessionId: string): Client[] =>
    [...clients.values()].filter((client) => client.sessionId === sessionId);

  const presence = (sessionId: string): Record<string, Presence> => {
    const state = store.get(sessionId);
    const out: Record<string, Presence> = {};
    if (!state) return out;
    const connected = new Set(
      clientsOf(sessionId)
        .map((client) => client.teamId)
        .filter((id): id is string => id !== null),
    );
    const seen = seenMap(sessionId);
    for (const teamId of Object.keys(state.teams)) {
      out[teamId] = {
        connected: connected.has(teamId),
        lastSeenAt: connected.has(teamId) ? store.clock.now() : (seen.get(teamId) ?? null),
      };
    }
    return out;
  };

  const screens = (sessionId: string) => {
    const list = clientsOf(sessionId);
    return {
      instructor: list.filter((c) => c.role === 'instructor').length,
      projector: list.filter((c) => c.role === 'projector').length,
    };
  };

  /** How long a team's terminal has been offline, or null when it is online. */
  const offlineMs = (sessionId: string, teamId: string): number | null => {
    const online = clientsOf(sessionId).some((client) => client.teamId === teamId);
    if (online) return null;
    const seen = seenMap(sessionId).get(teamId);
    // Never seen on this server (a fresh start, say) counts as long gone.
    if (seen === undefined) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, store.clock.now() - seen);
  };

  // -------------------------------------------------------------------------
  // Building and sending views.
  // -------------------------------------------------------------------------

  function viewFor(client: Client, state: SessionState): unknown {
    const now = store.clock.now();
    switch (client.role) {
      case 'instructor':
        return viewForInstructor(state, now, {
          presence: presence(state.sessionId),
          screens: screens(state.sessionId),
          suggested: nextSuggestedAction(state),
        });
      case 'projector':
        return viewForProjector(state, now);
      case 'team':
        if (client.teamId === null) return viewForUnclaimedTeam(state, now);
        return viewForTeam(state, client.teamId, now) ?? viewForUnclaimedTeam(state, now);
      default:
        return viewForUnclaimedTeam(state, now);
    }
  }

  function sendView(client: Client): void {
    if (client.sessionId === null || client.role === null || client.role === 'setup') return;
    const state = store.get(client.sessionId);
    if (!state) return;

    // A terminal whose token is no longer the team's has lost it. A team with
    // no token at all was released; one with a different token was taken over.
    if (client.role === 'team' && client.teamId !== null) {
      const team = state.teams[client.teamId];
      if (!team || team.token !== client.token) {
        client.teamId = null;
        client.token = null;
        gone(client, team && team.token !== null ? 'takenOver' : 'released');
      }
    }

    // A takeover this socket asked for may have been approved or turned down.
    if (client.waitingFor) {
      const team = state.teams[client.waitingFor.teamId];
      if (team?.token === client.waitingFor.token) {
        client.teamId = team.teamId;
        client.token = team.token;
        client.waitingFor = null;
        client.socket.emit(SERVER_EVENTS.claimed, claimResult(state, client.teamId, true));
      } else if (team && team.pendingTakeover === null) {
        client.waitingFor = null;
        gone(client, 'denied');
      }
    }

    const message: ViewMessage = {
      version: state.version,
      serverNow: store.clock.now(),
      view: viewFor(client, state),
    };
    client.lastViewAt = Date.now();
    client.socket.emit(SERVER_EVENTS.view, message);
  }

  /** Sends now if the socket has had a quiet 100 ms, otherwise soon. */
  function scheduleView(client: Client): void {
    const since = Date.now() - client.lastViewAt;
    if (since >= VIEW_GAP_MS) {
      sendView(client);
      return;
    }
    if (client.viewTimer !== null) {
      client.viewPending = true;
      return;
    }
    client.viewPending = true;
    client.viewTimer = setTimeout(() => {
      client.viewTimer = null;
      if (!client.viewPending) return;
      client.viewPending = false;
      sendView(client);
    }, VIEW_GAP_MS - since);
  }

  function broadcast(sessionId: string): void {
    for (const client of clientsOf(sessionId)) scheduleView(client);
  }

  function gone(client: Client, reason: GoneMessage['reason']): void {
    client.socket.emit(SERVER_EVENTS.gone, { reason, message: GONE_MESSAGES[reason] });
  }

  function claimResult(state: SessionState, teamId: string, tookOver: boolean): ClaimTeamResult {
    const team = state.teams[teamId];
    const letter = team?.letter ?? 'A';
    const worldNumber = team?.worldNumber ?? 0;
    return {
      teamId,
      worldId: team?.worldId ?? '',
      worldNumber,
      letter,
      label: teamLabel(worldNumber, letter),
      token: team?.token ?? '',
      tookOver,
    };
  }

  // -------------------------------------------------------------------------
  // Connections.
  // -------------------------------------------------------------------------

  const unsubscribe = store.onChange((sessionId, kind) => {
    if (kind === 'deleted') {
      for (const client of clientsOf(sessionId)) {
        gone(client, 'deleted');
        client.sessionId = null;
        client.teamId = null;
      }
      lastSeen.delete(sessionId);
      return;
    }
    broadcast(sessionId);
  });

  io.on('connection', (socket) => {
    const client: Client = {
      socket,
      role: null,
      actor: 'check',
      sessionId: null,
      teamId: null,
      token: null,
      waitingFor: null,
      recent: [],
      lastViewAt: 0,
      viewTimer: null,
      viewPending: false,
    };
    clients.set(socket.id, client);

    socket.on(CLIENT_EVENTS.hello, (raw: unknown, reply?: (result: unknown) => void) => {
      const parsed = helloSchema.safeParse(raw);
      if (!parsed.success) {
        reply?.({ ok: false, message: 'That connection request did not look right.' });
        return;
      }
      const result = authenticate(client, parsed.data);
      reply?.(result);
      if (result.ok) {
        if (client.sessionId !== null && client.teamId !== null) {
          seenMap(client.sessionId).set(client.teamId, store.clock.now());
        }
        sendView(client);
        // Someone joining changes the instructor's connected column.
        if (client.sessionId !== null) broadcast(client.sessionId);
      }
    });

    socket.on(CLIENT_EVENTS.command, (raw: unknown, reply?: (ack: Ack) => void) => {
      void handleCommand(client, raw).then((ack) => reply?.(ack));
    });

    socket.on('disconnect', () => {
      if (client.viewTimer !== null) clearTimeout(client.viewTimer);
      clients.delete(socket.id);
      if (client.sessionId !== null && client.teamId !== null) {
        seenMap(client.sessionId).set(client.teamId, store.clock.now());
      }
      if (client.sessionId !== null) broadcast(client.sessionId);
    });
  });

  function authenticate(client: Client, hello: Hello): HelloAck {
    if (hello.role === 'setup') {
      client.role = 'setup';
      client.actor = 'instructor';
      client.sessionId = null;
      return {
        ok: true,
        sessionId: '',
        role: 'setup',
        actor: 'instructor',
        teamId: null,
        serverNow: store.clock.now(),
        needsClaim: false,
      };
    }

    const state = store.get(hello.sessionId);
    if (!state) return { ok: false, message: 'That session is not open on this computer.' };

    if (hello.role === 'instructor' && hello.instructorKey !== state.instructorKey) {
      return { ok: false, message: 'That instructor link is not right for this session.' };
    }
    if (hello.role === 'projector' && hello.projectorKey !== state.projectorKey) {
      return { ok: false, message: 'That projector link is not right for this session.' };
    }

    client.role = hello.role;
    client.actor = ACTOR_FOR_ROLE[hello.role];
    client.sessionId = state.sessionId;
    client.teamId = null;
    client.token = null;

    let needsClaim = false;
    if (hello.role === 'team') {
      const token = hello.teamToken;
      const team = token
        ? Object.values(state.teams).find((candidate) => candidate.token === token)
        : undefined;
      if (team) {
        client.teamId = team.teamId;
        client.token = team.token;
      } else {
        needsClaim = true;
      }
    }

    return {
      ok: true,
      sessionId: state.sessionId,
      role: hello.role,
      actor: client.actor,
      teamId: client.teamId,
      serverNow: store.clock.now(),
      needsClaim,
    };
  }

  async function handleCommand(client: Client, raw: unknown): Promise<Ack> {
    const parsed = parseCommand(raw);
    if (!parsed.ok) {
      const id = idOf(raw);
      return ackFail(id, 'INVALID', parsed.message);
    }
    const command = parsed.command;

    if (client.role === null) {
      return ackFail(command.commandId, 'NOT_ALLOWED', 'Say hello before sending commands.');
    }

    const now = Date.now();
    client.recent = client.recent.filter((at) => now - at < BURST_WINDOW_MS);
    if (client.recent.length >= BURST_LIMIT) {
      return ackFail(
        command.commandId,
        'RATE_LIMITED',
        'That screen is sending a lot at once. Give it a moment and try again.',
      );
    }
    client.recent.push(now);

    if (command.type === 'createSession') {
      if (client.actor !== 'instructor') {
        return ackFail(command.commandId, 'NOT_ALLOWED', 'Only an instructor can start a session.');
      }
      return store.create(command);
    }

    if (client.sessionId === null) {
      return ackFail(command.commandId, 'NOT_FOUND', 'This screen is not in a session yet.');
    }

    const sessionId = client.sessionId;
    let terminalOfflineMs: number | null = null;
    if (command.type === 'claimTeam') {
      const state = store.get(sessionId);
      const team = Object.values(state?.teams ?? {}).find(
        (candidate) => candidate.joinCode === command.payload.joinCode,
      );
      terminalOfflineMs = team ? offlineMs(sessionId, team.teamId) : null;
    }

    const ack = await store.handle(sessionId, command, {
      actor: client.actor,
      actorId: client.teamId,
      terminalOfflineMs,
    });

    if (command.type === 'claimTeam') afterClaim(client, sessionId, ack);
    return ack;
  }

  /** Binds this socket to the team it just claimed, or remembers the request. */
  function afterClaim(client: Client, sessionId: string, ack: Ack): void {
    const state = store.get(sessionId);
    if (!state) return;

    if (ack.ok) {
      const result = ack.result as ClaimTeamResult | undefined;
      if (!result) return;
      client.teamId = result.teamId;
      client.token = result.token;
      client.waitingFor = null;
      seenMap(sessionId).set(result.teamId, store.clock.now());
      return;
    }

    if (ack.code !== 'NEEDS_APPROVAL') return;
    const waiting = Object.values(state.teams).find((team) => team.pendingTakeover !== null);
    if (waiting?.pendingTakeover) {
      client.waitingFor = { teamId: waiting.teamId, token: waiting.pendingTakeover.token };
    }
  }

  return {
    broadcast,
    presence,
    close() {
      unsubscribe();
      for (const client of clients.values()) {
        if (client.viewTimer !== null) clearTimeout(client.viewTimer);
      }
      clients.clear();
      lastSeen.clear();
    },
  };
}

const GONE_MESSAGES: Record<GoneMessage['reason'], string> = {
  deleted: 'This game has been closed by your teacher.',
  released: 'This computer is no longer running that country. You can join again.',
  takenOver: 'This team is now controlled from another computer.',
  denied: 'Your teacher kept this team on the other computer.',
};

/** Pulls a commandId out of something that failed to parse, so the ack matches. */
function idOf(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null) {
    const id = (raw as { commandId?: unknown }).commandId;
    if (typeof id === 'string' && id.length > 0) return id;
  }
  return 'unknown';
}
