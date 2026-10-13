/**
 * A TeamView a component test can hold in its hand.
 *
 * Component tests must never build a view by hand field by field: the day a field
 * is added to TeamView, every one of them would have to be edited. One builder
 * with sensible defaults keeps each test to the two or three fields it is really
 * about, and the type makes sure the shape stays honest.
 *
 * The defaults are World 2 - Borvia (B) with the standard-75 economics, in an
 * open Year 5 with nothing submitted yet.
 */

import type { CountryLetter } from '../../src/shared/constants.js';
import { teamLabel, yearLabel } from '../../src/shared/labels.js';
import type {
  CountryLineView,
  LeaderboardView,
  MessageView,
  MessagingView,
  PublicSettingsView,
  RevealView,
  TeamView,
  TimingView,
  YearRowView,
} from '../../src/shared/views.js';

export const NOW = 1_700_000_000_000;

export function publicSettings(over: Partial<PublicSettingsView> = {}): PublicSettingsView {
  return {
    a: 70,
    b: 0.3,
    cost: 1,
    capacity: 75,
    startingOutput: 40,
    disclosure: 'full',
    variancePct: 0,
    rotateEvery: 4,
    capacityTenths: 750,
    ...over,
  };
}

export function timing(over: Partial<TimingView> = {}): TimingView {
  return {
    serverNow: NOW,
    deadline: NOW + 120_000,
    remainingMs: 120_000,
    paused: false,
    seconds: 150,
    resumedAfterRestart: false,
    ...over,
  };
}

export function countryLine(
  letter: CountryLetter,
  over: Partial<CountryLineView> = {},
): CountryLineView {
  const names: Record<CountryLetter, string> = { A: 'Ardonia', B: 'Borvia', C: 'Cendra' };
  return {
    letter,
    countryName: names[letter],
    actualTenths: null,
    targetTenths: null,
    auto: false,
    profitK: null,
    ...over,
  };
}

export function yearRow(year: number, over: Partial<YearRowView> = {}): YearRowView {
  return {
    year,
    isPractice: year === 0,
    label: yearLabel(year),
    priceCents: 3400,
    ownTargetTenths: 400,
    ownActualTenths: 400,
    ownAuto: false,
    ownProfitK: 1_320_000,
    cumulativeProfitK: 1_320_000 * year,
    totalTenths: 1200,
    newProducerTenths: 0,
    others: null,
    ...over,
  };
}

export function reveal(over: Partial<RevealView> = {}): RevealView {
  return {
    year: 5,
    isPractice: false,
    label: 'Year 5',
    priceCents: 3400,
    priceChangeCents: -450,
    sentence: 'Price fell $4.50 because world supply rose 15.0 million barrels.',
    ownActualTenths: 383,
    ownTargetTenths: 383,
    ownAuto: false,
    ownProfitK: 1_264_000,
    cumulativeProfitK: 5_000_000,
    totalTenths: 1200,
    newProducerTenths: null,
    countries: [countryLine('A'), countryLine('B'), countryLine('C')],
    ...over,
  };
}

export function message(over: Partial<MessageView> = {}): MessageView {
  return {
    messageId: 'm1',
    letter: 'A',
    countryName: 'Ardonia',
    text: 'Shall we all produce 38.3?',
    at: NOW,
    ...over,
  };
}

/** Messaging off, which is how every world starts (SPEC 8.4). */
export function messaging(over: Partial<MessagingView> = {}): MessagingView {
  return { on: false, until: null, ...over };
}

export function leaderboard(over: Partial<LeaderboardView> = {}): LeaderboardView {
  return {
    countries: [
      {
        worldNumber: 2,
        letter: 'B',
        countryName: 'Borvia',
        label: teamLabel(2, 'B'),
        cumulativeProfitK: 5_000_000,
      },
    ],
    worlds: [{ worldNumber: 2, totalProfitK: 12_000_000, cooperativeMaxK: 15_000_000 }],
    ...over,
  };
}

export function teamView(over: Partial<TeamView> = {}): TeamView {
  return {
    kind: 'team',
    sessionId: 'session-demo',
    version: 7,
    teamId: 'world-2-B',
    worldNumber: 2,
    letter: 'B',
    countryName: 'Borvia',
    label: teamLabel(2, 'B'),
    members: ['Maya', 'Leo', 'Sam'],
    roles: { operator: 'Maya', envoys: ['Leo', 'Sam'], block: 1 },
    phase: 'YEAR_OPEN',
    year: 5,
    yearLabel: 'Year 5',
    isPractice: false,
    briefingSlide: 0,
    timing: timing(),
    between: null,
    settings: publicSettings(),
    decision: null,
    submitted: false,
    submittedCount: 0,
    history: [],
    reveal: null,
    messages: [],
    muted: false,
    messaging: messaging(),
    reflection: null,
    finalYearAnnounced: false,
    faceToFace: false,
    advanceAt: null,
    resultsRevealed: false,
    leaderboard: null,
    ...over,
  };
}
