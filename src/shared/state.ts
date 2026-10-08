/**
 * The shape of one session's state (SPEC sections 4-7).
 *
 * These are plain data types with no behaviour, because three different places
 * need them: the reducer in src/server/session that changes them, the views in
 * src/shared/views.ts that copy fields out of them, and the store that writes
 * them to snapshot.json. Nothing here is ever sent to a client; views are.
 */

import type { CountryLetter } from './constants.js';
import type { WorldYearOutcome } from './engine/engine.js';
import type { ActivityKind, Settings } from './settings.js';

export const PHASES = [
  'LOBBY',
  'BRIEFING',
  'PRACTICE_OPEN',
  'PRACTICE_REVEAL',
  'YEAR_OPEN',
  'YEAR_REVEAL',
  'BETWEEN',
  'ENDED',
] as const;
export type Phase = (typeof PHASES)[number];

/** The phases that hold decisions a team can still change. */
export const OPEN_PHASES: readonly Phase[] = ['PRACTICE_OPEN', 'YEAR_OPEN'];
/** The phases that show a settled year. */
export const REVEAL_PHASES: readonly Phase[] = ['PRACTICE_REVEAL', 'YEAR_REVEAL'];
/** The phases that run on a deadline. */
export const TIMED_PHASES: readonly Phase[] = ['PRACTICE_OPEN', 'YEAR_OPEN', 'BETWEEN'];

export const ACTORS = ['instructor', 'projector', 'team', 'check', 'system'] as const;
export type Actor = (typeof ACTORS)[number];

export const PROJECTOR_SCREENS = [
  'auto',
  'lobby',
  'play',
  'reveal',
  'worldComparison',
  'worldDetail',
  'leaderboard',
  'gameTheory',
  'questions',
] as const;
export type ProjectorScreen = (typeof PROJECTOR_SCREENS)[number];

/** The debrief screens, which are the ones the projector can be sent. */
export const DEBRIEF_PROJECTOR_SCREENS: readonly ProjectorScreen[] = [
  'worldComparison',
  'worldDetail',
  'leaderboard',
  'gameTheory',
  'questions',
];

export function isDebriefScreen(screen: ProjectorScreen): boolean {
  return DEBRIEF_PROJECTOR_SCREENS.includes(screen);
}

/** How many briefing screens there are (SPEC 8.3): story, price, roles, year. */
export const BRIEFING_SLIDES = 4;

/** Where a decision came from. "auto" is the server filling in a missing one. */
export type DecisionSource = 'team' | 'auto' | 'instructor';

export interface DecisionRecord {
  tenths: number;
  /** True when the server filled this in at close (SPEC section 4). */
  auto: boolean;
  source: DecisionSource;
  at: number;
  /** Only set when an instructor overrode the team (reason required). */
  reason?: string;
}

/** One world's settled year, kept forever so a reveal can be shown again. */
export interface WorldYearRecord {
  year: number;
  isPractice: boolean;
  decisions: Record<CountryLetter, DecisionRecord>;
  outcome: WorldYearOutcome;
  closedAt: number;
}

/** The year a world is currently playing, before it is closed. */
export interface OpenYearState {
  year: number;
  isPractice: boolean;
  decisions: Partial<Record<CountryLetter, DecisionRecord>>;
}

export interface WorldState {
  worldId: string;
  worldNumber: number;
  open: OpenYearState | null;
  /** Practice is stored on its own so it can never be added into a score. */
  practice: WorldYearRecord | null;
  /** Scored years, in the order they were played. */
  years: WorldYearRecord[];
}

export interface TerminalPresence {
  connected: boolean;
  lastSeenAt: number | null;
}

export interface TakeoverRequest {
  requestId: string;
  at: number;
  /** The token the new terminal gets if the instructor approves. */
  token: string;
}

export interface HuddleSuggestion {
  name: string;
  tenths: number;
}

export interface HuddleRecord {
  suggestions: HuddleSuggestion[];
  reason: string;
  at: number;
}

export interface PredictionRecord {
  /** The team's guess for the other two countries, in the order they appear. */
  othersTenths: number[];
  /** How much the team trusts any agreement in its world, 1 to 5. */
  trust: number;
  at: number;
}

export interface ReflectionRecord {
  answers: string[];
  at: number;
}

export interface TeamState {
  teamId: string;
  worldId: string;
  worldNumber: number;
  letter: CountryLetter;
  joinCode: string;
  members: string[];
  claimed: boolean;
  /** The current terminal's token. Never put in any view. */
  token: string | null;
  muted: boolean;
  pendingTakeover: TakeoverRequest | null;
  huddles: Record<number, HuddleRecord>;
  predictions: Record<number, PredictionRecord>;
  reflection: ReflectionRecord | null;
  lastMessageAt: number | null;
}

export type MessageKind = 'chat' | 'pledge' | 'announcement';

export interface MessageRecord {
  messageId: string;
  /** null on an announcement that went to every world. */
  worldId: string | null;
  /** null on an instructor announcement. */
  teamId: string | null;
  letter: CountryLetter | null;
  kind: MessageKind;
  text: string;
  /** Set on a pledge: the number the team promised, in tenths. */
  tenths?: number;
  at: number;
}

export type NewsKind = 'newProducer' | 'demand' | 'finalYear' | 'note';

/** Public news, shown on terminals and the projector. */
export interface NewsRecord {
  newsId: string;
  kind: NewsKind;
  worldId: string | null;
  year: number;
  text: string;
  at: number;
}

export interface OverrideRecord {
  teamId: string;
  year: number;
  fromTenths: number | null;
  toTenths: number;
  reason: string;
  at: number;
}

export interface FiredEventRecord {
  kind: 'newProducer' | 'demand';
  /** The year the event starts to bite. */
  year: number;
  at: number;
}

export interface NetworkCheckRecord {
  clientId: string;
  rttMs: number;
  transport: string;
  at: number;
  /**
   * The country whose computer this was, when the check page knew.
   *
   * null for a computer that had not claimed a team yet - the teacher's own
   * laptop, a spare, or a group checking the Wi-Fi before it has its card.
   */
  teamId: string | null;
}

export interface BetweenState {
  kind: ActivityKind;
  /** The year this activity follows. */
  afterYear: number;
  seconds: number;
}

export interface TimerState {
  /** When the open phase ends, in epoch milliseconds. null when paused or untimed. */
  deadline: number | null;
  paused: boolean;
  /** How long is left while paused, so resume can rebuild the deadline. */
  remainingMs: number | null;
  /** How long the phase was given, for the dashboard. */
  seconds: number | null;
  /**
   * Set only when the pause came from loading a session whose phase was still
   * running (SPEC section 9), so the dashboard can say "Resumed after restart -
   * press Resume" rather than implying the teacher paused it. Every command that
   * touches the timer builds a fresh TimerState, so it clears itself.
   */
  restarted?: true;
}

/** A stored ack, so a repeated commandId never applies twice. */
export interface StoredResult {
  ok: boolean;
  code?: string;
  message?: string;
  result?: unknown;
  version: number;
}

export interface SessionState {
  /** Bumped if the saved shape ever changes, so an old snapshot can be spotted. */
  schema: 1;
  sessionId: string;
  /** Created once and saved, so variance draws replay identically. */
  seed: string;
  createdAt: number;
  updatedAt: number;
  /** Rises on every accepted state-changing command. Clients see it on views. */
  version: number;
  /** How many events have been applied. The snapshot records it. */
  seq: number;
  instructorKey: string;
  projectorKey: string;
  settings: Settings;
  phase: Phase;
  /** 0 is the practice year everywhere in this project. */
  year: number;
  briefingSlide: number;
  timer: TimerState;
  between: BetweenState | null;
  finalYearAnnounced: boolean;
  resultsRevealedToTeams: boolean;
  projectorScreen: ProjectorScreen;
  /** Which world the mirrored World Detail screen is about, when one is sent. */
  projectorWorldNumber: number | null;
  worlds: WorldState[];
  teams: Record<string, TeamState>;
  messages: MessageRecord[];
  news: NewsRecord[];
  overrides: OverrideRecord[];
  firedEvents: FiredEventRecord[];
  networkChecks: Record<string, NetworkCheckRecord>;
  /** Keys like "3:chat", so an activity is never run twice by the suggester. */
  activitiesDone: string[];
  /** commandId to the ack it produced, for idempotency. */
  results: Record<string, StoredResult>;
  /** The order commandIds arrived in, so the oldest can be dropped. */
  resultOrder: string[];
}
