/**
 * The shape of the debrief (SPEC 8.4).
 *
 * Why it is one plain data structure and not a pile of functions the screens
 * call: the instructor screen and the projector have to show the same numbers
 * and the same titles at the same moment, so the server works them out once and
 * both screens render the same object (CLAUDE.md rules 1 and 2).
 *
 * Every number here stays in whole units - tenths of a million barrels, cents,
 * thousands of dollars - and the screens format them with src/shared/units.ts.
 * The one exception is a percent, which is already a whole number.
 */

import type { CountryLetter } from '../constants.js';

/** The debrief screens, which are also the screens the teacher can mirror. */
export const DEBRIEF_SCREENS = [
  'worldComparison',
  'worldDetail',
  'leaderboard',
  'gameTheory',
  'questions',
] as const;
export type DebriefScreen = (typeof DEBRIEF_SCREENS)[number];

/**
 * How far above its cooperative share a country may produce and still count as
 * cooperating, in whole percent. The break-year rule uses it.
 */
export const COOPERATION_SLACK_PCT = 10;

/** How many years in a row count as "this world had an agreement". */
export const COOPERATION_RUN = 2;

export interface DebriefCountryYear {
  letter: CountryLetter;
  countryName: string;
  targetTenths: number;
  actualTenths: number;
  /** True when the server filled this decision in because nobody submitted. */
  auto: boolean;
  profitK: number;
  cumulativeProfitK: number;
  /** An equal share of the best joint total for this year. */
  shareTenths: number;
  /** How far above that share this country produced, in whole percent. */
  aboveSharePct: number;
}

export interface DebriefYear {
  year: number;
  label: string;
  priceCents: number;
  totalTenths: number;
  newProducerTenths: number;
  /** The three countries' profit for this year added up. */
  jointProfitK: number;
  cumulativeJointProfitK: number;
  /** The most the three could have made together this year. */
  cooperativeMaxK: number;
  cumulativeCooperativeMaxK: number;
  percentOfMax: number;
  cumulativePercentOfMax: number;
  /** True when every country stayed within the slack above its share. */
  cooperative: boolean;
  countries: DebriefCountryYear[];
}

export interface DebriefBreak {
  /** The first year cooperation broke, or null when it never did. */
  year: number | null;
  /** The longest run of cooperative years, so a title can tell the cases apart. */
  longestRun: number;
  /** Which countries went over the line that year. */
  letters: CountryLetter[];
  /** One plain sentence, ready to show. */
  note: string;
}

export type DebriefMarkerKind = 'chat' | 'summit' | 'newProducer' | 'finalYear';

/** A moment worth labelling on a chart. */
export interface DebriefMarker {
  kind: DebriefMarkerKind;
  /** The year on the x axis the marker sits at. */
  year: number;
  label: string;
}

export interface DebriefMessage {
  messageId: string;
  letter: CountryLetter;
  countryName: string;
  text: string;
  at: number;
  /** The year this message came before, or null when no year followed it. */
  year: number | null;
}

export interface DebriefCountry {
  teamId: string;
  letter: CountryLetter;
  countryName: string;
  /** "World 2 - Borvia (B)". */
  label: string;
  members: string[];
  cumulativeProfitK: number;
  /** How many messages this country sent, across every window. */
  messagesSent: number;
  reflection: string[] | null;
}

export interface DebriefWorld {
  worldId: string;
  worldNumber: number;
  /** "World 2". */
  label: string;
  years: DebriefYear[];
  countries: DebriefCountry[];
  totalProfitK: number;
  cooperativeMaxK: number;
  percentOfMax: number;
  break: DebriefBreak;
  markers: DebriefMarker[];
  messages: DebriefMessage[];
  /** The finding this world's detail screen is titled with. */
  title: string;
}

export interface DebriefLeaderboardCountry {
  worldNumber: number;
  letter: CountryLetter;
  countryName: string;
  label: string;
  cumulativeProfitK: number;
}

export interface DebriefLeaderboardWorld {
  worldNumber: number;
  label: string;
  totalProfitK: number;
  cooperativeMaxK: number;
  percentOfMax: number;
}

export interface DebriefLeaderboard {
  countries: DebriefLeaderboardCountry[];
  worlds: DebriefLeaderboardWorld[];
}

/** Where one world ended up compared with the two benchmarks. */
export type DebriefLanding = 'cooperative' | 'between' | 'competitive' | 'beyond';

export interface DebriefWorldLanding {
  worldNumber: number;
  label: string;
  /** Average world supply over the scored years. */
  averageTotalTenths: number;
  percentOfMax: number;
  landing: DebriefLanding;
  /** One plain sentence about where this world landed. */
  note: string;
}

export interface DebriefTheory {
  /** The year the benchmarks are worked out for. */
  year: number;
  shareTenths: number;
  cooperativeTotalTenths: number;
  cooperativePriceCents: number;
  cooperativeMaxK: number;
  cooperativeEachProfitK: number;
  competitiveEachTenths: number;
  competitiveTotalTenths: number;
  competitivePriceCents: number;
  competitiveEachProfitK: number;
  /** The other two countries at the cooperative share, added together. */
  bestResponseOthersTenths: number;
  /** The best answer to that, and what the formula asked for before capacity. */
  bestResponseTenths: number;
  bestResponseRawTenths: number;
  bestResponseProfitK: number;
  /** What one country gains by doing it, and what each other country loses. */
  gainFromCheatingK: number;
  lossPerCooperatorK: number;
  landings: DebriefWorldLanding[];
}

export interface DebriefQuestion {
  number: number;
  /** Which learning goal it serves, for the teacher. */
  goal: string;
  text: string;
  /** The screen that answers it. */
  evidence: DebriefScreen;
  evidenceLabel: string;
}

export interface DebriefTitles {
  comparison: string;
  leaderboard: string;
  gameTheory: string;
  questions: string;
}

export interface DebriefData {
  /** The scored years that were actually played. */
  years: number[];
  worlds: DebriefWorld[];
  leaderboard: DebriefLeaderboard;
  theory: DebriefTheory;
  questions: DebriefQuestion[];
  titles: DebriefTitles;
  /** True when no scored year was played, so every screen can say so kindly. */
  empty: boolean;
}
