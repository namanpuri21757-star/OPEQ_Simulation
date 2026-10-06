/**
 * Scripted shortcuts for the integration tests: open a session, claim every
 * country, play a year, and so on.
 *
 * They go through real sockets and real commands, so a test that uses them is
 * still testing the whole server; they only save the test from retyping the
 * same six calls.
 *
 * Each one that changes the phase waits for every terminal to catch up before
 * it returns. Without that a test would race the broadcast and send its next
 * command with the guards from the view it had a moment ago.
 */

import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { PresetName, SettingsInput } from '../../src/shared/settings.js';
import type { GameClient } from './client.js';
import { claim, newSession, type Harness, type Session } from './harness.js';

export interface OpenGame {
  session: Session;
  instructor: GameClient;
  /** One terminal per country, in the order createSession listed them. */
  teams: GameClient[];
  /** Waits until every terminal has seen at least the instructor's version. */
  sync(): Promise<void>;
  /** The terminals of one world, by letter. */
  world(worldNumber: number): Record<string, GameClient>;
}

export async function openGame(
  harness: Harness,
  options: { preset?: PresetName; settings?: SettingsInput; claimAll?: boolean } = {},
): Promise<OpenGame> {
  const session = await newSession(harness, {
    ...(options.preset ? { preset: options.preset } : {}),
    settings: options.settings ?? { worlds: 1 },
  });

  const teams: GameClient[] = [];
  if (options.claimAll !== false) {
    for (const team of session.teams) {
      const client = await claim(harness, session.sessionId, team.joinCode, team.teamId);
      await client.must('setMembers', { names: ['Ada', 'Ben', 'Cleo'] });
      teams.push(client);
    }
  }

  return {
    session,
    instructor: session.instructor,
    teams,
    async sync() {
      const target = (session.instructor.view['version'] as number | undefined) ?? 0;
      await Promise.all(
        teams.map((client) =>
          client.waitForView(
            (view) => (view['version'] as number) >= target,
            `${client.name} to reach version ${String(target)}`,
          ),
        ),
      );
    },
    world(worldNumber) {
      const out: Record<string, GameClient> = {};
      for (const letter of COUNTRY_LETTERS) {
        const found = teams.find(
          (client) => client.teamId === `world-${String(worldNumber)}-${letter}`,
        );
        if (found) out[letter] = found;
      }
      return out;
    },
  };
}

/** Moves from the lobby to an open practice year. */
export async function startPractice(game: OpenGame): Promise<void> {
  await game.instructor.must('setBriefingSlide', { slide: 0 });
  await game.instructor.must('startPractice');
  await game.sync();
}

/** Everyone submits the same number, in whole tenths. */
export async function submitAll(game: OpenGame, tenths: number): Promise<void> {
  for (const team of game.teams) await team.must('submitDecision', { tenths });
}

export async function closeYear(game: OpenGame): Promise<void> {
  await game.instructor.must('closeYear');
  await game.sync();
}

export async function openYear(game: OpenGame, year: number): Promise<void> {
  await game.instructor.must('openYear', { year });
  await game.sync();
}

export async function startBetween(
  game: OpenGame,
  kind: 'chat' | 'summit',
  seconds = 240,
): Promise<void> {
  await game.instructor.must('startBetween', { kind, seconds });
  await game.sync();
}

export async function endBetween(game: OpenGame): Promise<void> {
  await game.instructor.must('endBetween');
  await game.sync();
}

/** Opens a year, has everyone submit, and closes it again. */
export async function playYear(game: OpenGame, year: number, tenths = 383): Promise<void> {
  await openYear(game, year);
  await submitAll(game, tenths);
  await closeYear(game);
}

/** Plays the practice year and then Year 1 up to and including `upTo`. */
export async function playYears(game: OpenGame, upTo: number, tenths = 383): Promise<void> {
  await startPractice(game);
  await submitAll(game, tenths);
  await closeYear(game);
  for (let year = 1; year <= upTo; year += 1) await playYear(game, year, tenths);
}

/** Waits until the dashboard agrees about whether a terminal is connected. */
export async function waitConnected(
  instructor: GameClient,
  teamId: string,
  connected: boolean,
): Promise<void> {
  await instructor.waitForView(
    (view) => {
      const teams = view['teams'] as Array<{ teamId: string; connected: boolean }> | undefined;
      return teams?.some((team) => team.teamId === teamId && team.connected === connected) ?? false;
    },
    `${teamId} to look ${connected ? 'connected' : 'offline'}`,
  );
}
