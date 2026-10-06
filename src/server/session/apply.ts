/**
 * The reducer: the only place session state ever changes.
 *
 * It is a pure function of (state, event). Every value that could differ
 * between two runs - the time, a generated id, how long a terminal had been
 * offline - arrives inside the event, never from a clock or from crypto here.
 * That is what makes replaying events.jsonl give back exactly the state the
 * class ended with (SPEC section 9).
 *
 * It never mutates the state it is given: it clones first and hands back a
 * candidate, so the store can refuse to commit if the append to disk fails
 * (CLAUDE.md rule 5).
 */

import { COUNTRY_LETTERS, type CountryLetter } from '../../shared/constants.js';
import {
  newProducerTenths,
  resolveWorldYear,
  type CountryTarget,
} from '../../shared/engine/engine.js';
import { cleanMemberName, filterText } from '../../shared/filter.js';
import { teamLabel } from '../../shared/labels.js';
import type { AckCode, Command, CommandType } from '../../shared/protocol.js';
import { COMMAND_META } from '../../shared/protocol.js';
import {
  economicUnits,
  parseSettings,
  PRESETS,
  secondsForYear,
  validateSettings,
  type Settings,
} from '../../shared/settings.js';
import type {
  Actor,
  DecisionRecord,
  Phase,
  SessionState,
  TeamState,
  WorldState,
  WorldYearRecord,
} from '../../shared/state.js';
import { chatIsOpen, teamIdFor } from '../../shared/views.js';
import { transitionFor, wrongPhaseMessage } from './transitions.js';

/** 1 message per 3 seconds per team (SPEC section 6). */
export const MESSAGE_GAP_MS = 3000;
/** A terminal offline this long may be taken over (SPEC section 9). */
export const TAKEOVER_AFTER_MS = 15000;
/** How many command results are remembered for idempotency. */
const MAX_REMEMBERED_RESULTS = 5000;

/**
 * Everything the reducer cannot work out for itself, decided once when the
 * command arrived and then stored in the event so replay sees the same values.
 */
export interface Issued {
  sessionId?: string;
  seed?: string;
  instructorKey?: string;
  projectorKey?: string;
  /** Fresh join codes, taken in order by the teams that need one. */
  codes?: string[];
  /** Fresh ids for messages and news items, taken in order. */
  ids?: string[];
  token?: string;
  requestId?: string;
  /** How long the team's terminal had been offline, or null when connected. */
  terminalOfflineMs?: number | null;
}

export interface SessionEvent {
  seq: number;
  /** When the command was accepted. Replay uses this, never the current time. */
  at: number;
  actor: Actor;
  /** The team that sent it, for team commands. */
  actorId: string | null;
  command: Command;
  issued: Issued;
}

export type ApplyResult =
  | { ok: true; state: SessionState; result?: unknown }
  /**
   * A failure may still carry a state: asking to take over a connected terminal
   * is answered NEEDS_APPROVAL and records the request at the same time.
   */
  | { ok: false; code: AckCode; message: string; state?: SessionState };

const fail = (code: AckCode, message: string): ApplyResult => ({ ok: false, code, message });

// ---------------------------------------------------------------------------
// Small helpers.
// ---------------------------------------------------------------------------

function takeId(event: SessionEvent, index: number): string {
  const id = event.issued.ids?.[index];
  // Replay of an old event that predates an id pool should still be readable.
  return id ?? `${String(event.seq)}-${String(index)}`;
}

function startTimer(state: SessionState, seconds: number, at: number): void {
  state.timer = {
    deadline: at + seconds * 1000,
    paused: false,
    remainingMs: seconds * 1000,
    seconds,
  };
}

function clearTimer(state: SessionState): void {
  state.timer = { deadline: null, paused: false, remainingMs: null, seconds: null };
}

function worldOf(state: SessionState, worldId: string): WorldState | undefined {
  return state.worlds.find((w) => w.worldId === worldId);
}

function teamOf(state: SessionState, teamId: string | null): TeamState | undefined {
  return teamId === null ? undefined : state.teams[teamId];
}

function emptyWorld(worldNumber: number): WorldState {
  return {
    worldId: `world-${String(worldNumber)}`,
    worldNumber,
    open: null,
    practice: null,
    years: [],
  };
}

function newTeam(world: WorldState, letter: CountryLetter, joinCode: string): TeamState {
  return {
    teamId: teamIdFor(world.worldId, letter),
    worldId: world.worldId,
    worldNumber: world.worldNumber,
    letter,
    joinCode,
    members: [],
    claimed: false,
    token: null,
    muted: false,
    pendingTakeover: null,
    huddles: {},
    predictions: {},
    reflection: null,
    lastMessageAt: null,
  };
}

function decision(
  tenths: number,
  at: number,
  source: DecisionRecord['source'],
  reason?: string,
): DecisionRecord {
  const base: DecisionRecord = { tenths, auto: source === 'auto', source, at };
  return reason === undefined ? base : { ...base, reason };
}

/**
 * Rebuilds the world and team lists for a number of worlds, keeping any team
 * that already exists so a group that has claimed a country keeps its code.
 */
function rebuildWorlds(state: SessionState, worlds: number, codes: string[]): void {
  const existing = state.teams;
  let nextCode = 0;
  state.worlds = Array.from({ length: worlds }, (_, i) => {
    const old = state.worlds[i];
    return old ?? emptyWorld(i + 1);
  });

  const teams: Record<string, TeamState> = {};
  for (const world of state.worlds) {
    for (const letter of COUNTRY_LETTERS) {
      const id = teamIdFor(world.worldId, letter);
      const old = existing[id];
      if (old) {
        teams[id] = old;
        continue;
      }
      const code = codes[nextCode] ?? `TEAM${String(nextCode)}`;
      nextCode += 1;
      teams[id] = newTeam(world, letter, code);
    }
  }
  state.teams = teams;
}

/** Everything a world forgets when the session is reset. */
function clearPlay(state: SessionState): void {
  for (const world of state.worlds) {
    world.open = null;
    world.practice = null;
    world.years = [];
  }
  for (const team of Object.values(state.teams)) {
    team.huddles = {};
    team.predictions = {};
    team.reflection = null;
    team.muted = false;
    team.lastMessageAt = null;
    team.pendingTakeover = null;
  }
  state.messages = [];
  state.news = [];
  state.overrides = [];
  state.firedEvents = [];
  state.activitiesDone = [];
  state.finalYearAnnounced = false;
  state.resultsRevealedToTeams = false;
  state.between = null;
  state.briefingSlide = 0;
  state.year = 0;
  state.projectorScreen = 'auto';
  clearTimer(state);
}

/**
 * A base setup plus the fields an instructor changed.
 *
 * The merge is one level deep on purpose: a form that sends `timers` sends the
 * whole group, so replacing it is what the instructor meant, and a half-merged
 * timer group would be far harder to reason about than a replaced one.
 */
function settingsFrom(
  base: Settings,
  patch: Record<string, unknown>,
): { ok: true; settings: Settings } | { ok: false; message: string } {
  const checked = validateSettings({ ...base, ...patch });
  if (checked.ok) return { ok: true, settings: checked.settings };
  const first = checked.errors[0];
  return {
    ok: false,
    message: first ? `${first.path}: ${first.message}` : 'Those settings cannot be used.',
  };
}

// ---------------------------------------------------------------------------
// createSession: the one command that makes a state out of nothing.
// ---------------------------------------------------------------------------

export function createInitialState(event: SessionEvent): ApplyResult {
  if (event.command.type !== 'createSession') {
    return fail('INVALID', 'A session has to start with createSession.');
  }
  const { preset, settings: patch } = event.command.payload;
  const built = settingsFrom(PRESETS[preset], patch as Record<string, unknown>);
  if (!built.ok) return fail('INVALID', built.message);

  const settings = built.settings;
  const issued = event.issued;

  const state: SessionState = {
    schema: 1,
    sessionId: issued.sessionId ?? 'session',
    seed: issued.seed ?? 'seed',
    createdAt: event.at,
    updatedAt: event.at,
    version: 1,
    seq: event.seq,
    instructorKey: issued.instructorKey ?? '',
    projectorKey: issued.projectorKey ?? '',
    settings,
    phase: 'LOBBY',
    year: 0,
    briefingSlide: 0,
    timer: { deadline: null, paused: false, remainingMs: null, seconds: null },
    between: null,
    finalYearAnnounced: false,
    resultsRevealedToTeams: false,
    projectorScreen: 'auto',
    worlds: [],
    teams: {},
    messages: [],
    news: [],
    overrides: [],
    firedEvents: [],
    networkChecks: {},
    activitiesDone: [],
    results: {},
    resultOrder: [],
  };

  rebuildWorlds(state, settings.worlds, issued.codes ?? []);

  return {
    ok: true,
    state,
    result: {
      sessionId: state.sessionId,
      instructorKey: state.instructorKey,
      projectorKey: state.projectorKey,
      teams: Object.values(state.teams).map((team) => ({
        teamId: team.teamId,
        worldId: team.worldId,
        worldNumber: team.worldNumber,
        letter: team.letter,
        joinCode: team.joinCode,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// applyEvent.
// ---------------------------------------------------------------------------

export function applyEvent(current: SessionState, event: SessionEvent): ApplyResult {
  const meta = COMMAND_META[event.command.type];

  if (!meta.actors.includes(event.actor)) {
    return fail('NOT_ALLOWED', notAllowedMessage(event.actor, event.command.type));
  }
  if (event.command.type === 'createSession') {
    return fail('INVALID', 'This session already exists.');
  }

  const guard = checkGuards(current, event);
  if (guard) return guard;

  const phaseCheck = checkPhase(current, event.command.type);
  if (phaseCheck) return phaseCheck;

  const state = structuredClone(current);
  const outcome = dispatch(state, event);

  // A rejection that recorded nothing throws the clone away, so the live state
  // is untouched. A rejection that did record something (a takeover request)
  // keeps its candidate and is committed like a success.
  const candidate = outcome.state;
  if (!candidate) return outcome;

  candidate.version += 1;
  candidate.seq = event.seq;
  candidate.updatedAt = event.at;

  // Remembering the ack here, inside the reducer, is what makes a repeated
  // commandId safe after a restart too: replaying the log rebuilds the memory.
  if (meta.persisted) {
    rememberResult(
      candidate,
      event.command.commandId,
      outcome.ok
        ? {
            ok: true,
            version: candidate.version,
            ...(outcome.result === undefined ? {} : { result: outcome.result }),
          }
        : { ok: false, code: outcome.code, message: outcome.message, version: candidate.version },
    );
  }
  return outcome;
}

function notAllowedMessage(actor: Actor, type: CommandType): string {
  if (actor === 'projector') return 'The projector screen can only watch, not change the game.';
  if (actor === 'team') return `Only the instructor can do that ("${type}").`;
  return `A ${actor} is not allowed to send "${type}".`;
}

function checkGuards(state: SessionState, event: SessionEvent): ApplyResult | null {
  const meta = COMMAND_META[event.command.type];
  if (!meta.guarded) return null;

  const { expectedPhase, expectedYear } = event.command;
  if (expectedPhase === undefined || expectedYear === undefined) {
    return fail(
      'INVALID',
      `"${event.command.type}" has to say which phase and year it was meant for.`,
    );
  }
  if (expectedPhase !== state.phase || expectedYear !== state.year) {
    return fail(
      'STALE',
      `The game has moved on. That was sent for ${expectedPhase} in year ${String(expectedYear)}, and we are now in ${state.phase} in year ${String(state.year)}.`,
    );
  }
  return null;
}

function checkPhase(state: SessionState, type: CommandType): ApplyResult | null {
  // ping and report are not phase commands, so they have no row in the table.
  if (type === 'ping' || type === 'report') return null;
  if (transitionFor(type, state.phase) === null) {
    return fail('CLOSED', wrongPhaseMessage(type, state.phase));
  }
  return null;
}

// ---------------------------------------------------------------------------
// One handler per command.
// ---------------------------------------------------------------------------

function dispatch(state: SessionState, event: SessionEvent): ApplyResult {
  const command = event.command;
  const at = event.at;

  switch (command.type) {
    case 'createSession':
      return fail('INVALID', 'This session already exists.');

    case 'updateSettings': {
      const built = settingsFrom(
        state.settings,
        command.payload.settings as Record<string, unknown>,
      );
      if (!built.ok) return fail('INVALID', built.message);
      state.settings = built.settings;
      rebuildWorlds(state, built.settings.worlds, event.issued.codes ?? []);
      return { ok: true, state };
    }

    case 'setBriefingSlide': {
      state.phase = 'BRIEFING';
      state.briefingSlide = command.payload.slide;
      return { ok: true, state };
    }

    case 'startPractice': {
      state.phase = 'PRACTICE_OPEN';
      state.year = 0;
      for (const world of state.worlds) world.open = { year: 0, isPractice: true, decisions: {} };
      startTimer(state, secondsForYear(0, state.settings), at);
      return { ok: true, state };
    }

    case 'closeYear':
      return closeYear(state, at);

    case 'openYear':
      return openYear(state, event, command.payload.year);

    case 'startBetween': {
      state.phase = 'BETWEEN';
      state.between = {
        kind: command.payload.kind,
        afterYear: state.year,
        seconds: command.payload.seconds,
      };
      state.activitiesDone.push(`${String(state.year)}:${command.payload.kind}`);
      startTimer(state, command.payload.seconds, at);
      return { ok: true, state };
    }

    case 'endBetween': {
      state.phase = 'YEAR_REVEAL';
      state.between = null;
      clearTimer(state);
      return { ok: true, state };
    }

    case 'pause': {
      if (state.timer.paused) return fail('NOT_ALLOWED', 'The timer is already paused.');
      if (state.timer.deadline === null) return fail('NOT_ALLOWED', 'There is no timer running.');
      state.timer = {
        deadline: null,
        paused: true,
        remainingMs: Math.max(0, state.timer.deadline - at),
        seconds: state.timer.seconds,
      };
      return { ok: true, state };
    }

    case 'resume': {
      if (!state.timer.paused) return fail('NOT_ALLOWED', 'The timer is already running.');
      const left = state.timer.remainingMs ?? 0;
      state.timer = {
        deadline: at + left,
        paused: false,
        remainingMs: left,
        seconds: state.timer.seconds,
      };
      return { ok: true, state };
    }

    case 'extend': {
      const extra = command.payload.seconds * 1000;
      if (state.timer.paused) {
        state.timer.remainingMs = (state.timer.remainingMs ?? 0) + extra;
      } else if (state.timer.deadline !== null) {
        state.timer.deadline += extra;
        state.timer.remainingMs = Math.max(0, state.timer.deadline - at);
      } else {
        return fail('NOT_ALLOWED', 'There is no timer to add time to.');
      }
      state.timer.seconds = (state.timer.seconds ?? 0) + command.payload.seconds;
      return { ok: true, state };
    }

    case 'announce': {
      const worldId = command.payload.worldId ?? null;
      if (worldId !== null && worldOf(state, worldId) === undefined) {
        return fail('NOT_FOUND', 'That world is not part of this session.');
      }
      state.messages.push({
        messageId: takeId(event, 0),
        worldId,
        teamId: null,
        letter: null,
        kind: 'announcement',
        text: filterText(command.payload.text).text,
        at,
      });
      return { ok: true, state };
    }

    case 'fireEvent':
      return fireEvent(state, event, command.payload.kind);

    case 'announceFinalYear': {
      if (!state.settings.finalYearWarning) {
        return fail('NOT_ALLOWED', 'The final-year warning is turned off for this game.');
      }
      if (state.year + 1 !== state.settings.years) {
        return fail(
          'NOT_ALLOWED',
          `The next year is not the last one, so there is nothing to announce yet.`,
        );
      }
      if (state.finalYearAnnounced) {
        return fail('NOT_ALLOWED', 'The final year has already been announced.');
      }
      state.finalYearAnnounced = true;
      state.news.push({
        newsId: takeId(event, 0),
        kind: 'finalYear',
        worldId: null,
        year: state.settings.years,
        text: 'This is the final year.',
        at,
      });
      return { ok: true, state };
    }

    case 'overrideDecision': {
      const team = state.teams[command.payload.teamId];
      if (!team) return fail('NOT_FOUND', 'There is no team with that name here.');
      const world = worldOf(state, team.worldId);
      if (!world?.open) return fail('CLOSED', 'That year is not open, so it cannot be changed.');
      const { capacityTenths } = economicUnits(state.settings);
      if (command.payload.tenths > capacityTenths) {
        return fail('INVALID', `That is more than the capacity of this game.`);
      }
      const before = world.open.decisions[team.letter] ?? null;
      world.open.decisions[team.letter] = decision(
        command.payload.tenths,
        at,
        'instructor',
        command.payload.reason,
      );
      state.overrides.push({
        teamId: team.teamId,
        year: world.open.year,
        fromTenths: before ? before.tenths : null,
        toTenths: command.payload.tenths,
        reason: command.payload.reason,
        at,
      });
      return { ok: true, state };
    }

    case 'muteTeam':
    case 'unmuteTeam': {
      const team = state.teams[command.payload.teamId];
      if (!team) return fail('NOT_FOUND', 'There is no team with that name here.');
      team.muted = command.type === 'muteTeam';
      return { ok: true, state };
    }

    case 'releaseTerminal': {
      const team = state.teams[command.payload.teamId];
      if (!team) return fail('NOT_FOUND', 'There is no team with that name here.');
      team.claimed = false;
      team.token = null;
      team.pendingTakeover = null;
      return { ok: true, state };
    }

    case 'approveTakeover': {
      const team = state.teams[command.payload.teamId];
      if (!team) return fail('NOT_FOUND', 'There is no team with that name here.');
      if (!team.pendingTakeover) return fail('NOT_FOUND', 'Nobody is waiting to take that team.');
      team.token = team.pendingTakeover.token;
      team.claimed = true;
      team.pendingTakeover = null;
      return { ok: true, state };
    }

    case 'denyTakeover': {
      const team = state.teams[command.payload.teamId];
      if (!team) return fail('NOT_FOUND', 'There is no team with that name here.');
      if (!team.pendingTakeover) return fail('NOT_FOUND', 'Nobody is waiting to take that team.');
      team.pendingTakeover = null;
      return { ok: true, state };
    }

    case 'endGame': {
      state.phase = 'ENDED';
      state.between = null;
      for (const world of state.worlds) world.open = null;
      clearTimer(state);
      return { ok: true, state };
    }

    case 'revealResultsToTeams': {
      state.resultsRevealedToTeams = true;
      return { ok: true, state };
    }

    case 'setProjectorScreen': {
      state.projectorScreen = command.payload.screen;
      return { ok: true, state };
    }

    case 'resetSession': {
      clearPlay(state);
      state.phase = 'LOBBY';
      return { ok: true, state };
    }

    case 'deleteSession':
      // The folder is removed by the store once this event is on disk.
      return { ok: true, state };

    case 'claimTeam':
      return claimTeam(state, event, command.payload.joinCode);

    case 'setMembers': {
      const team = teamOf(state, event.actorId);
      if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
      team.members = command.payload.names.map((name, i) => cleanMemberName(name, i));
      return { ok: true, state };
    }

    case 'submitDecision': {
      const team = teamOf(state, event.actorId);
      if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
      const world = worldOf(state, team.worldId);
      if (!world?.open) return fail('CLOSED', 'This year is closed. Your last number was kept.');
      const { capacityTenths } = economicUnits(state.settings);
      if (command.payload.tenths > capacityTenths) {
        return fail(
          'INVALID',
          `Your capacity is ${(capacityTenths / 10).toFixed(1)} million barrels, so that is too high.`,
        );
      }
      world.open.decisions[team.letter] = decision(command.payload.tenths, at, 'team');
      return { ok: true, state, result: { tenths: command.payload.tenths } };
    }

    case 'recordHuddle': {
      const team = teamOf(state, event.actorId);
      if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
      team.huddles[state.year] = {
        suggestions: command.payload.suggestions.map((s, i) => ({
          name: cleanMemberName(s.name, i),
          tenths: s.tenths,
        })),
        reason: filterText(command.payload.reason).text,
        at,
      };
      return { ok: true, state };
    }

    case 'submitPrediction': {
      const team = teamOf(state, event.actorId);
      if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
      const world = worldOf(state, team.worldId);
      if (!world?.open?.decisions[team.letter]) {
        return fail('NOT_ALLOWED', 'Submit your own number first, then make your guess.');
      }
      team.predictions[state.year] = {
        othersTenths: [...command.payload.othersTenths],
        trust: command.payload.trust,
        at,
      };
      return { ok: true, state };
    }

    case 'submitReflection': {
      const team = teamOf(state, event.actorId);
      if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
      team.reflection = {
        answers: command.payload.answers.map((answer) => filterText(answer).text),
        at,
      };
      return { ok: true, state };
    }

    case 'sendMessage':
      return sendMessage(state, event, filterText(command.payload.text).text, 'chat');

    case 'sendPledge': {
      const tenths = command.payload.tenths;
      const { capacityTenths } = economicUnits(state.settings);
      if (tenths > capacityTenths) {
        return fail('INVALID', 'You cannot promise more than your capacity.');
      }
      const text = `We will produce ${(tenths / 10).toFixed(1)} million barrels.`;
      return sendMessage(state, event, text, 'pledge', tenths);
    }

    case 'ping':
      return { ok: true, state, result: { serverNow: at } };

    case 'report': {
      state.networkChecks[command.payload.clientId] = {
        clientId: command.payload.clientId,
        rttMs: command.payload.rttMs,
        transport: command.payload.transport,
        at,
      };
      return { ok: true, state };
    }

    default: {
      // Exhaustiveness: a new command type must get a handler here.
      const never: never = command;
      return fail('INVALID', `Unknown command ${JSON.stringify(never)}.`);
    }
  }
}

// ---------------------------------------------------------------------------
// The three handlers that are too long to sit in the switch.
// ---------------------------------------------------------------------------

/** What a country produces when it never submitted (SPEC section 4). */
function autoTenths(world: WorldState, letter: CountryLetter, year: number, settings: Settings) {
  const { startingOutputTenths } = economicUnits(settings);
  if (year <= 1) return startingOutputTenths;
  const previous = world.years.find((record) => record.year === year - 1);
  return previous ? previous.decisions[letter].tenths : startingOutputTenths;
}

function closeYear(state: SessionState, at: number): ApplyResult {
  const isPractice = state.phase === 'PRACTICE_OPEN';

  for (const world of state.worlds) {
    const open = world.open;
    if (!open) return fail('CLOSED', 'There is no open year to close.');

    const decisions = {} as Record<CountryLetter, DecisionRecord>;
    const targets = {} as Record<CountryLetter, CountryTarget>;
    for (const letter of COUNTRY_LETTERS) {
      const given = open.decisions[letter];
      const record =
        given ?? decision(autoTenths(world, letter, open.year, state.settings), at, 'auto');
      decisions[letter] = record;
      targets[letter] = { tenths: record.tenths, auto: record.auto };
    }

    const outcome = resolveWorldYear({
      settings: state.settings,
      sessionSeed: state.seed,
      worldId: world.worldId,
      year: open.year,
      isPractice: open.isPractice,
      targets,
    });

    const record: WorldYearRecord = {
      year: open.year,
      isPractice: open.isPractice,
      decisions,
      outcome,
      closedAt: at,
    };
    // Practice is kept on its own field so it can never be added into a score.
    if (open.isPractice) world.practice = record;
    else world.years.push(record);
    world.open = null;
  }

  state.phase = isPractice ? 'PRACTICE_REVEAL' : 'YEAR_REVEAL';
  clearTimer(state);
  return { ok: true, state };
}

function openYear(state: SessionState, event: SessionEvent, year: number): ApplyResult {
  if (year !== state.year + 1) {
    return fail(
      'STALE',
      `The next year is Year ${String(state.year + 1)}, not Year ${String(year)}.`,
    );
  }
  if (year > state.settings.years) {
    return fail(
      'CLOSED',
      `This game has ${String(state.settings.years)} years, so that is the end.`,
    );
  }

  const settings = state.settings;
  const arrivedNow =
    newProducerTenths(year, settings) > 0 && newProducerTenths(year - 1, settings) === 0;
  const demandNow = settings.demandEvent.enabled && settings.demandEvent.year === year;

  state.phase = 'YEAR_OPEN';
  state.year = year;
  state.between = null;
  for (const world of state.worlds) world.open = { year, isPractice: false, decisions: {} };
  startTimer(state, secondsForYear(year, settings), event.at);

  // News is public, so it is only written when the event was announced.
  let idIndex = 0;
  if (arrivedNow && settings.newProducer.announced) {
    state.news.push({
      newsId: takeId(event, idIndex),
      kind: 'newProducer',
      worldId: null,
      year,
      text: `Another producer has started selling ${settings.newProducer.output.toFixed(1)} million barrels a year.`,
      at: event.at,
    });
    idIndex += 1;
  }
  if (demandNow && settings.demandEvent.announced) {
    state.news.push({
      newsId: takeId(event, idIndex),
      kind: 'demand',
      worldId: null,
      year,
      text: filterText(settings.demandEvent.message).text,
      at: event.at,
    });
  }

  return { ok: true, state };
}

function fireEvent(
  state: SessionState,
  event: SessionEvent,
  kind: 'newProducer' | 'demand',
): ApplyResult {
  const nextYear = state.year + 1;
  if (nextYear > state.settings.years) {
    return fail('CLOSED', 'There are no more years, so an event would never happen.');
  }

  if (kind === 'newProducer') {
    if (newProducerTenths(state.year, state.settings) > 0) {
      return fail('NOT_ALLOWED', 'The new producer is already in the market.');
    }
    state.settings = parseSettings({
      ...state.settings,
      newProducer: { ...state.settings.newProducer, enabled: true, year: nextYear },
    });
  } else {
    const demand = state.settings.demandEvent;
    if (demand.enabled && state.year >= demand.year) {
      return fail('NOT_ALLOWED', 'That demand change has already happened.');
    }
    state.settings = parseSettings({
      ...state.settings,
      demandEvent: { ...demand, enabled: true, year: nextYear },
    });
  }

  state.firedEvents.push({ kind, year: nextYear, at: event.at });
  return { ok: true, state };
}

function claimTeam(state: SessionState, event: SessionEvent, joinCode: string): ApplyResult {
  const team = Object.values(state.teams).find((t) => t.joinCode === joinCode);
  if (!team) {
    return fail(
      'NOT_FOUND',
      'We could not find that code. Check the card on your table and try again.',
    );
  }

  const token = event.issued.token ?? '';
  const result = {
    teamId: team.teamId,
    worldId: team.worldId,
    worldNumber: team.worldNumber,
    letter: team.letter,
    label: teamLabel(team.worldNumber, team.letter),
    token,
  };

  if (!team.claimed) {
    team.claimed = true;
    team.token = token;
    team.pendingTakeover = null;
    return { ok: true, state, result: { ...result, tookOver: false } };
  }

  const offlineMs = event.issued.terminalOfflineMs ?? null;
  if (offlineMs !== null && offlineMs >= TAKEOVER_AFTER_MS) {
    team.token = token;
    team.claimed = true;
    team.pendingTakeover = null;
    return { ok: true, state, result: { ...result, tookOver: true } };
  }

  // The other terminal is still there, so the instructor decides.
  team.pendingTakeover = { requestId: event.issued.requestId ?? '', at: event.at, token };
  return {
    ok: false,
    code: 'NEEDS_APPROVAL',
    message: `${teamLabel(team.worldNumber, team.letter)} is already open on another computer. Your teacher has been asked to move it here.`,
    state,
  };
}

function sendMessage(
  state: SessionState,
  event: SessionEvent,
  text: string,
  kind: 'chat' | 'pledge',
  tenths?: number,
): ApplyResult {
  const team = teamOf(state, event.actorId);
  if (!team) return fail('NOT_FOUND', 'This computer has not taken a country yet.');
  if (team.muted) {
    return fail('MUTED', 'Your teacher has paused messages from this team for now.');
  }
  if (!chatIsOpen(state)) {
    return fail(
      'CLOSED',
      state.settings.chatMode === 'off'
        ? 'Messages are turned off in this game.'
        : 'The message window is closed right now. Wait for the next one.',
    );
  }
  if (team.lastMessageAt !== null && event.at - team.lastMessageAt < MESSAGE_GAP_MS) {
    return fail('RATE_LIMITED', 'That was quick. Wait a moment before sending another message.');
  }

  team.lastMessageAt = event.at;
  const message = {
    messageId: takeId(event, 0),
    worldId: team.worldId,
    teamId: team.teamId,
    letter: team.letter,
    kind,
    text,
    at: event.at,
  };
  state.messages.push(tenths === undefined ? message : { ...message, tenths });
  return { ok: true, state };
}

// ---------------------------------------------------------------------------
// Idempotency bookkeeping, used by the store.
// ---------------------------------------------------------------------------

function rememberResult(
  state: SessionState,
  commandId: string,
  stored: SessionState['results'][string],
): void {
  state.results[commandId] = stored;
  state.resultOrder.push(commandId);
  while (state.resultOrder.length > MAX_REMEMBERED_RESULTS) {
    const oldest = state.resultOrder.shift();
    if (oldest !== undefined) delete state.results[oldest];
  }
}

/** True when the session is on a phase that runs down a clock. */
export function isTimedPhase(phase: Phase): boolean {
  return phase === 'PRACTICE_OPEN' || phase === 'YEAR_OPEN' || phase === 'BETWEEN';
}

/** True when every country in every world has submitted (the autoClose rule). */
export function everyoneSubmitted(state: SessionState): boolean {
  return state.worlds.every((world) => {
    const open = world.open;
    if (!open) return false;
    return COUNTRY_LETTERS.every((letter) => open.decisions[letter] !== undefined);
  });
}
