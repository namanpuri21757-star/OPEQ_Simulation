/**
 * An InstructorView a component test can hold in its hand.
 *
 * Same reasoning as teamView.ts: no test builds a view field by field, or every
 * one of them would need editing the day a field is added. The defaults are a
 * three-world standard-75 game in an open Year 5 with nothing submitted, and a
 * test overrides only the two or three fields it is about.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES, type CountryLetter } from '../../src/shared/constants.js';
import { teamLabel, yearLabel } from '../../src/shared/labels.js';
import { competitiveOutcome, cooperativeMax } from '../../src/shared/engine/engine.js';
import { DEFAULT_SETTINGS, type Settings } from '../../src/shared/settings.js';
import type {
  InstructorTeamView,
  InstructorView,
  InstructorWorldView,
  LeaderboardView,
  ProjectorView,
  SuggestedAction,
} from '../../src/shared/views.js';
import { NOW, timing } from './teamView.js';

export const INSTRUCTOR_KEY = 'instructor-key-long-enough-01';
export const PROJECTOR_KEY = 'projector-key-long-enough-01';

export function suggested(over: Partial<SuggestedAction> = {}): SuggestedAction {
  return {
    command: 'closeYear',
    label: 'Close Year 5',
    payload: {},
    expectedPhase: 'YEAR_OPEN',
    expectedYear: 5,
    ...over,
  };
}

export function instructorTeam(
  worldNumber: number,
  letter: CountryLetter,
  over: Partial<InstructorTeamView> = {},
): InstructorTeamView {
  return {
    teamId: `world-${String(worldNumber)}-${letter}`,
    worldId: `world-${String(worldNumber)}`,
    worldNumber,
    letter,
    countryName: COUNTRY_NAMES[letter],
    label: teamLabel(worldNumber, letter),
    joinCode: `W${String(worldNumber)}${letter}${'XYZ'.slice(0, 3)}`,
    claimed: true,
    connected: true,
    lastSeenAt: NOW,
    members: ['Ada', 'Ben'],
    roles: { operator: 'Ada', envoys: ['Ben'], block: 1 },
    muted: false,
    pendingTakeover: false,
    decision: null,
    reflection: null,
    cumulativeProfitK: 0,
    ...over,
  };
}

export function instructorWorld(
  worldNumber: number,
  over: Partial<InstructorWorldView> = {},
): InstructorWorldView {
  return {
    worldId: `world-${String(worldNumber)}`,
    worldNumber,
    openYear: 5,
    submittedCount: 0,
    records: [],
    ...over,
  };
}

function emptyLeaderboard(worldNumbers: readonly number[]): LeaderboardView {
  return {
    countries: worldNumbers.flatMap((worldNumber) =>
      COUNTRY_LETTERS.map((letter) => ({
        worldNumber,
        letter,
        countryName: COUNTRY_NAMES[letter],
        label: teamLabel(worldNumber, letter),
        cumulativeProfitK: 0,
      })),
    ),
    worlds: worldNumbers.map((worldNumber) => ({
      worldNumber,
      totalProfitK: 0,
      cooperativeMaxK: 0,
    })),
  };
}

/** The benchmarks the real view carries, worked out the same way it does. */
function benchmarks(settings: Settings, year: number): InstructorView['benchmarks'] {
  const competitive = competitiveOutcome(settings, year);
  const cooperative = cooperativeMax(settings, year);
  return {
    competitiveEachTenths: competitive.eachTenths,
    competitivePriceCents: competitive.priceCents,
    cooperativeShareTenths: cooperative.shareTenths,
    cooperativeMaxK: cooperative.jointMaxK,
  };
}

export interface InstructorViewOptions extends Partial<InstructorView> {
  /** How many worlds to build teams and worlds for. 3 by default. */
  worldCount?: number;
}

export function instructorView(over: InstructorViewOptions = {}): InstructorView {
  const { worldCount = 3, ...rest } = over;
  const numbers = Array.from({ length: worldCount }, (_, index) => index + 1);
  const settings = rest.settings ?? DEFAULT_SETTINGS;
  const year = rest.year ?? 5;

  return {
    kind: 'instructor',
    sessionId: 'session-demo',
    version: 12,
    instructorKey: INSTRUCTOR_KEY,
    projectorKey: PROJECTOR_KEY,
    seed: 'seed-demo',
    settings,
    phase: 'YEAR_OPEN',
    year,
    yearLabel: yearLabel(year),
    briefingSlide: 0,
    timing: timing(),
    between: null,
    finalYearAnnounced: false,
    resultsRevealedToTeams: false,
    projectorScreen: 'auto',
    projectorWorldNumber: null,
    suggested: suggested(),
    worlds: numbers.map((worldNumber) => instructorWorld(worldNumber)),
    teams: numbers.flatMap((worldNumber) =>
      COUNTRY_LETTERS.map((letter) => instructorTeam(worldNumber, letter)),
    ),
    messages: [],
    messagesByWorld: Object.fromEntries(
      numbers.map((worldNumber) => [`world-${String(worldNumber)}`, []]),
    ),
    messaging: numbers.map((worldNumber) => ({
      worldId: `world-${String(worldNumber)}`,
      worldNumber,
      on: false,
      until: null,
    })),
    overrides: [],
    firedEvents: [],
    networkChecks: {},
    activitiesDone: [],
    screens: { instructor: 1, projector: 1 },
    leaderboard: emptyLeaderboard(numbers),
    debrief: null,
    benchmarks: benchmarks(settings, Math.max(1, year)),
    ...rest,
  };
}

// ---------------------------------------------------------------------------
// The projector's view.
// ---------------------------------------------------------------------------

/**
 * A ProjectorView for a component test.
 *
 * It lives beside the instructor builder because the two are usually compared:
 * the test that matters most is "the projector carries none of what the
 * dashboard does".
 */
export function projectorView(
  over: Partial<ProjectorView> & { worldCount?: number } = {},
): ProjectorView {
  const { worldCount = 3, ...rest } = over;
  const numbers = Array.from({ length: worldCount }, (_, index) => index + 1);
  const year = rest.year ?? 5;

  return {
    kind: 'projector',
    sessionId: 'session-demo',
    version: 12,
    phase: 'YEAR_OPEN',
    year,
    yearLabel: yearLabel(year),
    briefingSlide: 0,
    timing: timing(),
    between: null,
    messaging: { on: false, until: null },
    finalYearAnnounced: false,
    worlds: numbers.map((worldNumber) => ({
      worldNumber,
      priceCents: null,
      priceChangeCents: null,
      year: null,
      rows: [],
      messagingOn: false,
    })),
    tables: numbers.flatMap((worldNumber) =>
      COUNTRY_LETTERS.map((letter) => ({
        worldNumber,
        letter,
        countryName: COUNTRY_NAMES[letter],
        label: teamLabel(worldNumber, letter),
        claimed: false,
      })),
    ),
    screen: 'auto',
    worldNumber: null,
    showsPrices: true,
    resultsRevealed: false,
    leaderboard: null,
    debrief: null,
    ...rest,
  };
}
