/**
 * The wire protocol: every command a client may send, every ack it gets back,
 * and every message the server pushes (SPEC section 9).
 *
 * Why one file: the client and the server must agree exactly, and a zod schema
 * that both import is the only way to be sure. Nothing here touches state.
 *
 * Why a discriminated union instead of a loose { type, payload }: zod then picks
 * the one payload schema that belongs to the type, so an unknown field or a
 * missing one is caught before any handler runs (CLAUDE.md rule 4).
 */

import { z } from 'zod';
import { type CountryLetter, JOIN_CODE_LENGTH } from './constants.js';
import { settingsShape, PRESET_NAMES } from './settings.js';
import { PHASES, PROJECTOR_SCREENS, BRIEFING_SLIDES } from './state.js';
import type { Actor, Phase } from './state.js';

// ---------------------------------------------------------------------------
// Small pieces every command shares.
// ---------------------------------------------------------------------------

export const MAX_MESSAGE_CHARS = 280;
export const MAX_HUDDLE_REASON_CHARS = 140;
export const MAX_REFLECTION_CHARS = 500;
export const MAX_MEMBER_NAME_CHARS = 20;
export const MAX_MEMBERS = 4;
export const MAX_EXTEND_SECONDS = 600;
/** How many years a command may name. Generous; settings cap the real game. */
const MAX_YEAR = 40;

const commandId = z.string().min(8).max(64);
const sessionId = z.string().min(4).max(64);
const teamId = z.string().min(3).max(64);
const worldId = z.string().min(3).max(64);
const key = z.string().min(16).max(128);
const token = z.string().min(16).max(128);

/** Quantities cross the wire as whole tenths of a million barrels (rule 3). */
const tenths = z.number().int().min(0).max(100000);

export const phaseSchema = z.enum(PHASES);
export const yearSchema = z.number().int().min(0).max(MAX_YEAR);

/** A name a group typed for itself: trimmed, and never only spaces. */
const memberName = z
  .string()
  .max(MAX_MEMBER_NAME_CHARS * 2)
  .transform((s) => s.trim())
  .refine((s) => s.length >= 1 && s.length <= MAX_MEMBER_NAME_CHARS, {
    message: `A name has to be 1 to ${String(MAX_MEMBER_NAME_CHARS)} characters.`,
  });

export const settingsInputSchema = settingsShape.partial();

// ---------------------------------------------------------------------------
// Commands.
// ---------------------------------------------------------------------------

function command<T extends string, P extends z.ZodTypeAny>(type: T, payload: P) {
  return z.strictObject({
    commandId,
    type: z.literal(type),
    payload,
    /**
     * Staleness guards (SPEC section 9). Optional in the schema and required by
     * COMMAND_META for the commands where a late click would do harm, so one
     * schema can serve both a guarded and an unguarded command.
     */
    expectedPhase: phaseSchema.optional(),
    expectedYear: yearSchema.optional(),
  });
}

const empty = z.strictObject({});

export const commandSchema = z.discriminatedUnion('type', [
  // --- setting a session up -------------------------------------------------
  command(
    'createSession',
    z.strictObject({
      preset: z.enum(PRESET_NAMES).default('standard-75'),
      settings: settingsInputSchema.default({}),
    }),
  ),
  command('updateSettings', z.strictObject({ settings: settingsInputSchema })),

  // --- moving the class along ----------------------------------------------
  command(
    'setBriefingSlide',
    z.strictObject({
      slide: z
        .number()
        .int()
        .min(0)
        .max(BRIEFING_SLIDES - 1),
    }),
  ),
  command('startPractice', empty),
  command('closeYear', empty),
  command('openYear', z.strictObject({ year: z.number().int().min(1).max(MAX_YEAR) })),
  command(
    'startBetween',
    z.strictObject({
      kind: z.enum(['chat', 'summit']),
      seconds: z.number().int().min(5).max(3600),
    }),
  ),
  command('endBetween', empty),
  command('pause', empty),
  command('resume', empty),
  command('extend', z.strictObject({ seconds: z.number().int().min(1).max(MAX_EXTEND_SECONDS) })),

  // --- talking to the room --------------------------------------------------
  command(
    'announce',
    z.strictObject({
      text: z.string().min(1).max(MAX_MESSAGE_CHARS),
      /** Left out means every world. */
      worldId: worldId.optional(),
    }),
  ),
  command('fireEvent', z.strictObject({ kind: z.enum(['newProducer', 'demand']) })),
  command('announceFinalYear', empty),

  // --- looking after teams --------------------------------------------------
  command(
    'overrideDecision',
    z.strictObject({
      teamId,
      tenths,
      reason: z.string().min(1).max(MAX_HUDDLE_REASON_CHARS),
    }),
  ),
  command('muteTeam', z.strictObject({ teamId })),
  command('unmuteTeam', z.strictObject({ teamId })),
  command('releaseTerminal', z.strictObject({ teamId })),
  command('approveTakeover', z.strictObject({ teamId })),
  command('denyTakeover', z.strictObject({ teamId })),

  // --- finishing ------------------------------------------------------------
  command('endGame', empty),
  command('revealResultsToTeams', empty),
  command('setProjectorScreen', z.strictObject({ screen: z.enum(PROJECTOR_SCREENS) })),
  command('resetSession', z.strictObject({ confirm: z.literal('RESET') })),
  command('deleteSession', z.strictObject({ confirm: z.literal('DELETE') })),

  // --- team commands --------------------------------------------------------
  command(
    'claimTeam',
    z.strictObject({
      joinCode: z
        .string()
        .trim()
        .toUpperCase()
        .length(JOIN_CODE_LENGTH, {
          message: `A join code is ${String(JOIN_CODE_LENGTH)} characters, like the one on your card.`,
        }),
    }),
  ),
  command('setMembers', z.strictObject({ names: z.array(memberName).min(1).max(MAX_MEMBERS) })),
  command('submitDecision', z.strictObject({ tenths })),
  command(
    'recordHuddle',
    z.strictObject({
      suggestions: z.array(z.strictObject({ name: memberName, tenths })).max(MAX_MEMBERS),
      reason: z.string().max(MAX_HUDDLE_REASON_CHARS).default(''),
    }),
  ),
  command('sendMessage', z.strictObject({ text: z.string().min(1).max(MAX_MESSAGE_CHARS) })),
  command('sendPledge', z.strictObject({ tenths })),
  command(
    'submitPrediction',
    z.strictObject({
      othersTenths: z.tuple([tenths, tenths]),
      trust: z.number().int().min(1).max(5),
    }),
  ),
  command(
    'submitReflection',
    z.strictObject({
      answers: z.tuple([
        z.string().max(MAX_REFLECTION_CHARS),
        z.string().max(MAX_REFLECTION_CHARS),
        z.string().max(MAX_REFLECTION_CHARS),
      ]),
    }),
  ),

  // --- network check (/check) ----------------------------------------------
  command('ping', empty),
  command(
    'report',
    z.strictObject({
      clientId: z.string().min(4).max(64),
      rttMs: z.number().int().min(0).max(600000),
      transport: z.enum(['websocket', 'polling', 'unknown']),
    }),
  ),
]);

export type Command = z.output<typeof commandSchema>;
export type CommandInput = z.input<typeof commandSchema>;
export type CommandType = Command['type'];
export type PayloadOf<T extends CommandType> = Extract<Command, { type: T }>['payload'];

// ---------------------------------------------------------------------------
// What each command is allowed to do.
// ---------------------------------------------------------------------------

export interface CommandMeta {
  /** Who may send it. "system" is the 1-second tick closing an overdue phase. */
  actors: readonly Actor[];
  /** True when expectedPhase and expectedYear are required and checked. */
  guarded: boolean;
  /** False only for commands that change nothing, so nothing is written. */
  persisted: boolean;
}

const instructorOnly = (guarded: boolean): CommandMeta => ({
  actors: ['instructor'],
  guarded,
  persisted: true,
});

const teamOnly = (guarded: boolean): CommandMeta => ({
  actors: ['team'],
  guarded,
  persisted: true,
});

export const COMMAND_META: Record<CommandType, CommandMeta> = {
  createSession: { actors: ['instructor'], guarded: false, persisted: true },
  updateSettings: instructorOnly(false),

  setBriefingSlide: instructorOnly(false),
  startPractice: instructorOnly(true),
  // The tick closes an overdue year, so "system" may send it too.
  closeYear: { actors: ['instructor', 'system'], guarded: true, persisted: true },
  openYear: instructorOnly(true),
  startBetween: instructorOnly(true),
  endBetween: { actors: ['instructor', 'system'], guarded: true, persisted: true },
  pause: instructorOnly(false),
  resume: instructorOnly(false),
  extend: instructorOnly(false),

  announce: instructorOnly(false),
  fireEvent: instructorOnly(true),
  announceFinalYear: instructorOnly(true),

  overrideDecision: instructorOnly(true),
  muteTeam: instructorOnly(false),
  unmuteTeam: instructorOnly(false),
  releaseTerminal: instructorOnly(false),
  approveTakeover: instructorOnly(false),
  denyTakeover: instructorOnly(false),

  endGame: instructorOnly(false),
  revealResultsToTeams: instructorOnly(false),
  setProjectorScreen: instructorOnly(false),
  resetSession: instructorOnly(false),
  deleteSession: instructorOnly(false),

  claimTeam: { actors: ['team'], guarded: false, persisted: true },
  setMembers: teamOnly(false),
  submitDecision: teamOnly(true),
  recordHuddle: teamOnly(true),
  sendMessage: teamOnly(false),
  sendPledge: teamOnly(false),
  submitPrediction: teamOnly(true),
  submitReflection: teamOnly(false),

  ping: { actors: ['instructor', 'projector', 'team', 'check'], guarded: false, persisted: false },
  report: {
    actors: ['instructor', 'projector', 'team', 'check'],
    guarded: false,
    persisted: true,
  },
};

// ---------------------------------------------------------------------------
// Acks.
// ---------------------------------------------------------------------------

export const ACK_CODES = [
  'NOT_ALLOWED',
  'STALE',
  'CLOSED',
  'INVALID',
  'RATE_LIMITED',
  'MUTED',
  'NOT_FOUND',
  'NEEDS_APPROVAL',
  'STORAGE',
] as const;
export type AckCode = (typeof ACK_CODES)[number];

export interface AckOk {
  ok: true;
  commandId: string;
  version: number;
  result?: unknown;
}

export interface AckFail {
  ok: false;
  commandId: string;
  code: AckCode;
  /** Plain, kind wording, because a student may read it (CLAUDE.md rule 8). */
  message: string;
}

export type Ack = AckOk | AckFail;

export function ackOk(commandId: string, version: number, result?: unknown): AckOk {
  return result === undefined
    ? { ok: true, commandId, version }
    : { ok: true, commandId, version, result };
}

export function ackFail(commandId: string, code: AckCode, message: string): AckFail {
  return { ok: false, commandId, code, message };
}

/** What createSession hands back to the instructor screen. */
export interface CreateSessionResult {
  sessionId: string;
  instructorKey: string;
  projectorKey: string;
  teams: Array<{
    teamId: string;
    worldId: string;
    worldNumber: number;
    letter: CountryLetter;
    joinCode: string;
  }>;
}

/** What claimTeam hands back to a terminal. */
export interface ClaimTeamResult {
  teamId: string;
  worldId: string;
  worldNumber: number;
  letter: CountryLetter;
  label: string;
  token: string;
  /** True when this terminal took over from one that had gone offline. */
  tookOver: boolean;
}

// ---------------------------------------------------------------------------
// hello: the first thing a socket sends.
// ---------------------------------------------------------------------------

export const helloSchema = z.discriminatedUnion('role', [
  /** A brand new instructor, before any session exists. May only createSession. */
  z.strictObject({ role: z.literal('setup') }),
  z.strictObject({ role: z.literal('instructor'), sessionId, instructorKey: key }),
  z.strictObject({ role: z.literal('projector'), sessionId, projectorKey: key }),
  z.strictObject({
    role: z.literal('team'),
    sessionId,
    /** Left out by a terminal that has not claimed a team yet. */
    teamToken: token.optional(),
  }),
  z.strictObject({ role: z.literal('check'), sessionId }),
]);

export type Hello = z.output<typeof helloSchema>;
export type HelloRole = Hello['role'];

export interface HelloResult {
  sessionId: string;
  role: HelloRole;
  actor: Actor;
  /** Set for a team socket that presented a valid token. */
  teamId: string | null;
  serverNow: number;
  /** True when the token was rejected, so the terminal knows to claim again. */
  needsClaim: boolean;
}

// ---------------------------------------------------------------------------
// Server to client.
// ---------------------------------------------------------------------------

/** The one push message: the recipient's own view (SPEC section 9, no diffs). */
export interface ViewMessage<V = unknown> {
  version: number;
  serverNow: number;
  view: V;
}

export const SERVER_EVENTS = {
  view: 'view',
  /** The session was deleted, or this terminal lost its claim. */
  gone: 'gone',
  /** A takeover this terminal asked for was approved; here is its token. */
  claimed: 'claimed',
} as const;

export interface GoneMessage {
  reason: 'deleted' | 'released' | 'takenOver' | 'denied';
  message: string;
}

/** The answer to a hello: the client's own identity, or a reason it failed. */
export type HelloAck = ({ ok: true } & HelloResult) | { ok: false; message: string };

export const CLIENT_EVENTS = {
  hello: 'hello',
  command: 'command',
} as const;

/** Parses an incoming command. Returns a friendly message, never a zod dump. */
export type CommandParse = { ok: true; command: Command } | { ok: false; message: string };

export function parseCommand(raw: unknown): CommandParse {
  const result = commandSchema.safeParse(raw);
  if (result.success) return { ok: true, command: result.data };

  const issue = result.error.issues[0];
  const where = issue && issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
  const what = issue ? issue.message : 'Something in that request did not look right.';
  return { ok: false, message: `${what}${where}` };
}

// ---------------------------------------------------------------------------
// GET /api/sessions
// ---------------------------------------------------------------------------

/**
 * A join code names a team, not a session, so a terminal has to find out which
 * session is open on this computer before it can even say hello (SPEC 8.2).
 * This summary is deliberately tiny: no keys, no team ids, no join codes.
 */
export interface OpenSessionSummary {
  sessionId: string;
  createdAt: number;
  phase: Phase;
  /** True when at least one country is still free to claim. */
  anyFree: boolean;
}

export interface OpenSessionsResponse {
  sessions: OpenSessionSummary[];
}
