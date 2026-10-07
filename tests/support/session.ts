/**
 * A SessionState a unit test can hold in its hand.
 *
 * The debrief and the exports are pure functions of a session, so they are
 * easiest to test against a session that was never played: a few worlds, a list
 * of numbers per year, and whatever messages or notes the test is about. Every
 * year is settled by resolveWorldYear, the same function the server uses, so a
 * test can never assert a profit the real game would not produce.
 */

import { COUNTRY_LETTERS, type CountryLetter } from '../../src/shared/constants.js';
import { resolveWorldYear } from '../../src/shared/engine/engine.js';
import { teamIdFor } from '../../src/shared/labels.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings.js';
import type {
  HuddleRecord,
  MessageRecord,
  PredictionRecord,
  SessionState,
  TeamState,
  WorldState,
  WorldYearRecord,
} from '../../src/shared/state.js';

/** The three countries' targets for one year, in tenths. */
export type Triple = [number, number, number];

/** A fixed start, so every timestamp in a test is predictable. */
export const BASE_AT = 1_700_000_000_000;
/** One year's worth of make-believe time. */
export const YEAR_MS = 100_000;

export const SESSION_SEED = 'test-seed';

/** When the given year closed in a built session. */
export function closedAt(year: number): number {
  return BASE_AT + (year + 1) * YEAR_MS;
}

export interface MakeSessionOptions {
  settings?: Settings;
  /** One list of years per world: plays[world][year] = [A, B, C] in tenths. */
  plays: Triple[][];
  /** An optional practice year per world, which must never be scored. */
  practice?: Triple[];
  /** Letters whose decision was filled in by the server, as "1:A" (year:letter). */
  autos?: string[];
  members?: string[];
}

function worldId(index: number): string {
  return `world-${String(index + 1)}`;
}

function recordFor(
  settings: Settings,
  index: number,
  year: number,
  isPractice: boolean,
  tenths: Triple,
  autos: Set<string>,
): WorldYearRecord {
  const decisions = {} as WorldYearRecord['decisions'];
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;

  COUNTRY_LETTERS.forEach((letter, position) => {
    const auto = autos.has(`${String(year)}:${letter}`);
    const value = tenths[position] ?? 0;
    targets[letter] = { tenths: value, auto };
    decisions[letter] = {
      tenths: value,
      auto,
      source: auto ? 'auto' : 'team',
      at: closedAt(year) - 1000,
    };
  });

  return {
    year,
    isPractice,
    decisions,
    outcome: resolveWorldYear({
      settings,
      sessionSeed: SESSION_SEED,
      worldId: worldId(index),
      year,
      isPractice,
      targets,
    }),
    closedAt: closedAt(year),
  };
}

function teamsFor(
  worlds: readonly WorldState[],
  members: readonly string[],
): Record<string, TeamState> {
  const teams: Record<string, TeamState> = {};
  for (const world of worlds) {
    for (const letter of COUNTRY_LETTERS) {
      const teamId = teamIdFor(world.worldId, letter);
      teams[teamId] = {
        teamId,
        worldId: world.worldId,
        worldNumber: world.worldNumber,
        letter,
        joinCode: `CODE${String(world.worldNumber)}${letter}`,
        members: [...members],
        claimed: true,
        token: 'token-not-in-any-view',
        muted: false,
        pendingTakeover: null,
        huddles: {},
        predictions: {},
        reflection: null,
        lastMessageAt: null,
      };
    }
  }
  return teams;
}

export function makeSession(options: MakeSessionOptions): SessionState {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const autos = new Set(options.autos ?? []);
  const members = options.members ?? ['Ada', 'Ben', 'Cleo'];

  const worlds: WorldState[] = options.plays.map((years, index) => ({
    worldId: worldId(index),
    worldNumber: index + 1,
    open: null,
    practice: options.practice?.[index]
      ? recordFor(settings, index, 0, true, options.practice[index], autos)
      : null,
    years: years.map((tenths, position) =>
      recordFor(settings, index, position + 1, false, tenths, autos),
    ),
  }));

  return {
    schema: 1,
    sessionId: 'session-test',
    seed: SESSION_SEED,
    createdAt: BASE_AT,
    updatedAt: closedAt(options.plays[0]?.length ?? 0),
    version: 1,
    seq: 1,
    instructorKey: 'instructor-key-long-enough-01',
    projectorKey: 'projector-key-long-enough-01',
    settings,
    phase: 'ENDED',
    year: options.plays[0]?.length ?? 0,
    briefingSlide: 0,
    timer: { deadline: null, paused: false, remainingMs: null, seconds: null },
    between: null,
    finalYearAnnounced: false,
    resultsRevealedToTeams: false,
    projectorScreen: 'auto',
    projectorWorldNumber: null,
    worlds,
    teams: teamsFor(worlds, members),
    messages: [],
    news: [],
    overrides: [],
    firedEvents: [],
    networkChecks: {},
    activitiesDone: [],
    results: {},
    resultOrder: [],
  };
}

/** Adds a pledge to a world's channel, placed just before that year closed. */
export function addPledge(
  state: SessionState,
  worldNumber: number,
  letter: CountryLetter,
  year: number,
  tenths: number,
): MessageRecord {
  const message: MessageRecord = {
    messageId: `pledge-${String(worldNumber)}-${letter}-${String(year)}`,
    worldId: worldId(worldNumber - 1),
    teamId: teamIdFor(worldId(worldNumber - 1), letter),
    letter,
    kind: 'pledge',
    text: `We will produce ${String(tenths / 10)} million barrels.`,
    tenths,
    at: closedAt(year) - 2000,
  };
  state.messages.push(message);
  return message;
}

/** Adds a plain chat message, placed just before that year closed. */
export function addChat(
  state: SessionState,
  worldNumber: number,
  letter: CountryLetter,
  year: number,
  text: string,
): void {
  state.messages.push({
    messageId: `chat-${String(worldNumber)}-${letter}-${String(year)}-${String(state.messages.length)}`,
    worldId: worldId(worldNumber - 1),
    teamId: teamIdFor(worldId(worldNumber - 1), letter),
    letter,
    kind: 'chat',
    text,
    at: closedAt(year) - 3000,
  });
}

export function setHuddle(
  state: SessionState,
  worldNumber: number,
  letter: CountryLetter,
  year: number,
  record: HuddleRecord,
): void {
  const team = state.teams[teamIdFor(worldId(worldNumber - 1), letter)];
  if (team) team.huddles[year] = record;
}

export function setPrediction(
  state: SessionState,
  worldNumber: number,
  letter: CountryLetter,
  year: number,
  record: PredictionRecord,
): void {
  const team = state.teams[teamIdFor(worldId(worldNumber - 1), letter)];
  if (team) team.predictions[year] = record;
}

export function setReflection(
  state: SessionState,
  worldNumber: number,
  letter: CountryLetter,
  answers: [string, string, string],
): void {
  const team = state.teams[teamIdFor(worldId(worldNumber - 1), letter)];
  if (team) team.reflection = { answers, at: BASE_AT };
}
