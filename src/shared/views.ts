/**
 * The three views (SPEC section 7).
 *
 * The one rule that matters here: every view is built by copying allowed fields
 * into a new object. Nothing ever starts from the session state and deletes
 * fields, because the day someone adds a field to state, a delete-based view
 * would start leaking it and a copy-based view would not (CLAUDE.md rule 2).
 *
 * Nothing in this file reads a clock. The caller passes `now`, so a view is a
 * pure function of state plus a timestamp and a test can assert it exactly.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES, type CountryLetter } from './constants.js';
import { debriefFor, debriefForProjector, type DebriefData } from './debrief.js';
import {
  competitiveOutcome,
  cooperativeMax,
  explainChange,
  type PriceSnapshot,
  snapshotOf,
} from './engine/engine.js';
import { teamIdFor, teamLabel, yearLabel } from './labels.js';
import { rolesForYear, type RoleAssignment } from './roles.js';
import {
  economicUnits,
  type ActivityKind,
  type DisclosureMode,
  type Settings,
} from './settings.js';
import { isDebriefScreen } from './state.js';
import type {
  BetweenState,
  DecisionRecord,
  MessageRecord,
  NewsRecord,
  Phase,
  ProjectorScreen,
  SessionState,
  WorldState,
  WorldYearRecord,
} from './state.js';

// ---------------------------------------------------------------------------
// Shared pieces.
// ---------------------------------------------------------------------------

/** The clock every screen counts down from. */
export interface TimingView {
  serverNow: number;
  deadline: number | null;
  remainingMs: number | null;
  paused: boolean;
  seconds: number | null;
  /**
   * True when this pause came from a restart rather than from the teacher
   * (SPEC section 9). The dashboard turns it into one alert.
   */
  resumedAfterRestart: boolean;
}

/** The economics a student is allowed to know, for the What-if calculator. */
export interface PublicSettingsView {
  a: number;
  b: number;
  cost: number;
  capacity: number;
  startingOutput: number;
  disclosure: DisclosureMode;
  chatMode: Settings['chatMode'];
  variancePct: number;
  rotateEvery: number;
  /** Capacity in tenths, so a client never has to multiply by 10 itself. */
  capacityTenths: number;
}

export interface MessageView {
  messageId: string;
  kind: MessageRecord['kind'];
  /** The country that wrote it, or null for an instructor announcement. */
  letter: CountryLetter | null;
  countryName: string | null;
  text: string;
  tenths?: number;
  at: number;
}

export interface NewsView {
  newsId: string;
  kind: NewsRecord['kind'];
  year: number;
  text: string;
  at: number;
}

export interface BetweenView {
  kind: ActivityKind;
  afterYear: number;
  seconds: number;
}

/** One country's line in a revealed year, as far as the recipient may see it. */
export interface CountryLineView {
  letter: CountryLetter;
  countryName: string;
  /** null when disclosure hides other countries' output. */
  actualTenths: number | null;
  targetTenths: number | null;
  auto: boolean;
  /** Only ever set for the recipient's own country. */
  profitK: number | null;
  /** The latest pledge made in the world channel before the year closed. */
  pledgeTenths: number | null;
}

export interface YearRowView {
  year: number;
  isPractice: boolean;
  label: string;
  priceCents: number;
  ownTargetTenths: number;
  ownActualTenths: number;
  ownAuto: boolean;
  ownProfitK: number;
  /** Own cumulative profit over scored years only. 0 on the practice row. */
  cumulativeProfitK: number;
  /** null under priceOnly, where the world total is private. */
  totalTenths: number | null;
  /** The new producer's barrels, shown as "Other suppliers" under full. */
  newProducerTenths: number | null;
  /** null unless disclosure is full. */
  others: CountryLineView[] | null;
}

export interface RevealView {
  year: number;
  isPractice: boolean;
  label: string;
  priceCents: number;
  /** How the price moved since the year before, or null for the first one. */
  priceChangeCents: number | null;
  /** One plain sentence, already filtered for what this team may know. */
  sentence: string;
  ownActualTenths: number;
  ownTargetTenths: number;
  ownAuto: boolean;
  ownProfitK: number;
  cumulativeProfitK: number;
  totalTenths: number | null;
  newProducerTenths: number | null;
  countries: CountryLineView[];
}

export interface LeaderboardCountryRow {
  worldNumber: number;
  letter: CountryLetter;
  countryName: string;
  label: string;
  cumulativeProfitK: number;
}

export interface LeaderboardWorldRow {
  worldNumber: number;
  totalProfitK: number;
  /** The best the three could have made together, for the percentage. */
  cooperativeMaxK: number;
}

export interface LeaderboardView {
  countries: LeaderboardCountryRow[];
  worlds: LeaderboardWorldRow[];
}

// ---------------------------------------------------------------------------
// Timing.
// ---------------------------------------------------------------------------

export function timingView(state: SessionState, now: number): TimingView {
  const { deadline, paused, remainingMs, seconds } = state.timer;
  const left = paused ? remainingMs : deadline === null ? null : Math.max(0, deadline - now);
  return {
    serverNow: now,
    deadline: paused ? null : deadline,
    remainingMs: left,
    paused,
    seconds,
    resumedAfterRestart: state.timer.restarted === true,
  };
}

function publicSettings(settings: Settings): PublicSettingsView {
  return {
    a: settings.a,
    b: settings.b,
    cost: settings.cost,
    capacity: settings.capacity,
    startingOutput: settings.startingOutput,
    disclosure: settings.disclosure,
    chatMode: settings.chatMode,
    variancePct: settings.variancePct,
    rotateEvery: settings.rotateEvery,
    capacityTenths: economicUnits(settings).capacityTenths,
  };
}

function messageView(record: MessageRecord): MessageView {
  const base: MessageView = {
    messageId: record.messageId,
    kind: record.kind,
    letter: record.letter,
    countryName: record.letter === null ? null : COUNTRY_NAMES[record.letter],
    text: record.text,
    at: record.at,
  };
  return record.tenths === undefined ? base : { ...base, tenths: record.tenths };
}

function newsView(record: NewsRecord): NewsView {
  return {
    newsId: record.newsId,
    kind: record.kind,
    year: record.year,
    text: record.text,
    at: record.at,
  };
}

function betweenView(between: BetweenState | null): BetweenView | null {
  if (between === null) return null;
  return { kind: between.kind, afterYear: between.afterYear, seconds: between.seconds };
}

// ---------------------------------------------------------------------------
// Reading a world's history.
// ---------------------------------------------------------------------------

/** Scored years first, with the practice row in front when there is one. */
function allRecords(world: WorldState): WorldYearRecord[] {
  return world.practice ? [world.practice, ...world.years] : [...world.years];
}

function worldOf(state: SessionState, worldId: string): WorldState | undefined {
  return state.worlds.find((w) => w.worldId === worldId);
}

/** The latest pledge each country made in a world before a moment in time. */
function pledgesBefore(
  state: SessionState,
  worldId: string,
  before: number,
): Partial<Record<CountryLetter, number>> {
  const out: Partial<Record<CountryLetter, number>> = {};
  for (const message of state.messages) {
    if (message.kind !== 'pledge') continue;
    if (message.worldId !== worldId) continue;
    if (message.at > before) continue;
    if (message.letter === null || message.tenths === undefined) continue;
    out[message.letter] = message.tenths;
  }
  return out;
}

function countryLine(
  record: WorldYearRecord,
  letter: CountryLetter,
  isOwn: boolean,
  disclosure: DisclosureMode,
  pledgeTenths: number | null,
): CountryLineView {
  const outcome = record.outcome.countries[letter];
  const decision: DecisionRecord | undefined = record.decisions[letter];
  const maySeeOutput = isOwn || disclosure === 'full';
  return {
    letter,
    countryName: COUNTRY_NAMES[letter],
    actualTenths: maySeeOutput ? outcome.actualTenths : null,
    targetTenths: maySeeOutput ? (decision?.tenths ?? outcome.targetTenths) : null,
    auto: maySeeOutput ? outcome.auto : false,
    profitK: isOwn ? outcome.profitK : null,
    pledgeTenths,
  };
}

/**
 * Builds a team's year-by-year table.
 *
 * Cumulative profit runs over scored years only, so the practice row shows 0
 * and never moves the total (SPEC section 3).
 */
function yearRowsFor(state: SessionState, world: WorldState, letter: CountryLetter): YearRowView[] {
  const disclosure = state.settings.disclosure;
  let cumulative = 0;
  return allRecords(world).map((record) => {
    const own = record.outcome.countries[letter];
    if (!record.isPractice) cumulative += own.profitK;
    const pledges = pledgesBefore(state, world.worldId, record.closedAt);

    const others =
      disclosure === 'full'
        ? COUNTRY_LETTERS.filter((l) => l !== letter).map((l) =>
            countryLine(record, l, false, disclosure, pledges[l] ?? null),
          )
        : null;

    return {
      year: record.year,
      isPractice: record.isPractice,
      label: record.isPractice ? 'PRACTICE' : yearLabel(record.year),
      priceCents: record.outcome.priceCents,
      ownTargetTenths: record.decisions[letter].tenths,
      ownActualTenths: own.actualTenths,
      ownAuto: own.auto,
      ownProfitK: own.profitK,
      cumulativeProfitK: record.isPractice ? 0 : cumulative,
      totalTenths: disclosure === 'priceOnly' ? null : record.outcome.totalTenths,
      newProducerTenths: disclosure === 'full' ? record.outcome.newProducerTenths : null,
      others,
    };
  });
}

/** The snapshot of the year before a record, for the "why did it move" line. */
function previousSnapshot(world: WorldState, record: WorldYearRecord): PriceSnapshot | null {
  const records = allRecords(world);
  const index = records.findIndex(
    (r) => r.isPractice === record.isPractice && r.year === record.year,
  );
  const before = index > 0 ? records[index - 1] : undefined;
  return before ? snapshotOf(before.outcome) : null;
}

function revealFor(
  state: SessionState,
  world: WorldState,
  letter: CountryLetter,
): RevealView | null {
  const records = allRecords(world);
  const record = records[records.length - 1];
  if (!record) return null;
  // Only show a reveal while the session is actually on a reveal screen.
  if (state.phase !== 'PRACTICE_REVEAL' && state.phase !== 'YEAR_REVEAL') return null;

  const disclosure = state.settings.disclosure;
  const previous = previousSnapshot(world, record);
  const rows = yearRowsFor(state, world, letter);
  const row = rows[rows.length - 1];
  const own = record.outcome.countries[letter];
  const pledges = pledgesBefore(state, world.worldId, record.closedAt);

  return {
    year: record.year,
    isPractice: record.isPractice,
    label: record.isPractice ? 'PRACTICE' : yearLabel(record.year),
    priceCents: record.outcome.priceCents,
    priceChangeCents: previous === null ? null : record.outcome.priceCents - previous.priceCents,
    sentence: explainChange(previous, snapshotOf(record.outcome), disclosure),
    ownActualTenths: own.actualTenths,
    ownTargetTenths: record.decisions[letter].tenths,
    ownAuto: own.auto,
    ownProfitK: own.profitK,
    cumulativeProfitK: row ? row.cumulativeProfitK : 0,
    totalTenths: disclosure === 'priceOnly' ? null : record.outcome.totalTenths,
    newProducerTenths: disclosure === 'full' ? record.outcome.newProducerTenths : null,
    countries: COUNTRY_LETTERS.map((l) =>
      countryLine(record, l, l === letter, disclosure, pledges[l] ?? null),
    ),
  };
}

/** Cumulative profit over scored years for one country in one world. */
export function cumulativeProfitK(world: WorldState, letter: CountryLetter): number {
  return world.years.reduce((sum, record) => sum + record.outcome.countries[letter].profitK, 0);
}

/**
 * The leaderboard.
 *
 * It names a world by its number and a country by its letter, never by the ids
 * the server uses, because teams see this once results are released and an id
 * is the one thing a team has no business learning about another world.
 */
export function leaderboardView(state: SessionState): LeaderboardView {
  const countries: LeaderboardCountryRow[] = [];
  const worlds: LeaderboardWorldRow[] = [];

  for (const world of state.worlds) {
    let total = 0;
    for (const letter of COUNTRY_LETTERS) {
      const profit = cumulativeProfitK(world, letter);
      total += profit;
      countries.push({
        worldNumber: world.worldNumber,
        letter,
        countryName: COUNTRY_NAMES[letter],
        label: teamLabel(world.worldNumber, letter),
        cumulativeProfitK: profit,
      });
    }
    // The benchmark is the same every scored year, so one year times the count.
    const perYear = world.years.reduce(
      (sum, record) => sum + cooperativeMax(state.settings, record.year).jointMaxK,
      0,
    );
    worlds.push({
      worldNumber: world.worldNumber,
      totalProfitK: total,
      cooperativeMaxK: perYear,
    });
  }

  countries.sort((x, y) => y.cumulativeProfitK - x.cumulativeProfitK);
  worlds.sort((x, y) => y.totalProfitK - x.totalProfitK);
  return { countries, worlds };
}

export { teamIdFor } from './labels.js';

// ---------------------------------------------------------------------------
// viewForTeam.
// ---------------------------------------------------------------------------

export interface TeamView {
  kind: 'team';
  sessionId: string;
  version: number;
  teamId: string;
  worldNumber: number;
  letter: CountryLetter;
  countryName: string;
  label: string;
  members: string[];
  roles: RoleAssignment;
  phase: Phase;
  year: number;
  yearLabel: string;
  isPractice: boolean;
  briefingSlide: number;
  timing: TimingView;
  between: BetweenView | null;
  settings: PublicSettingsView;
  /** What this team has entered for the open year, if anything. */
  decision: { tenths: number; auto: boolean; at: number; byInstructor: boolean } | null;
  submitted: boolean;
  /** How many of the three countries in this world have submitted. */
  submittedCount: number;
  history: YearRowView[];
  reveal: RevealView | null;
  messages: MessageView[];
  news: NewsView[];
  muted: boolean;
  chatOpen: boolean;
  huddle: { suggestions: Array<{ name: string; tenths: number }>; reason: string } | null;
  prediction: { othersTenths: number[]; trust: number } | null;
  reflection: { answers: string[] } | null;
  finalYearAnnounced: boolean;
  resultsRevealed: boolean;
  /** Only once the instructor has released results (SPEC section 7). */
  leaderboard: LeaderboardView | null;
}

/** True when this team may send a message right now (SPEC section 6). */
export function chatIsOpen(state: SessionState): boolean {
  const mode = state.settings.chatMode;
  if (mode === 'off') return false;
  if (mode === 'always') return true;
  return state.phase === 'BETWEEN';
}

export function viewForTeam(state: SessionState, teamId: string, now: number): TeamView | null {
  const team = state.teams[teamId];
  if (!team) return null;
  const world = worldOf(state, team.worldId);
  if (!world) return null;

  const letter = team.letter;
  const open = world.open;
  const decision = open?.decisions[letter] ?? null;
  const members = team.members.length > 0 ? team.members : [];
  const roles = rolesForYear(
    members.length > 0 ? members : ['Member 1', 'Member 2', 'Member 3'],
    state.year,
    state.settings.rotateEvery,
  );

  const huddle = team.huddles[state.year];
  const prediction = team.predictions[state.year];

  return {
    kind: 'team',
    sessionId: state.sessionId,
    version: state.version,
    teamId: team.teamId,
    worldNumber: team.worldNumber,
    letter,
    countryName: COUNTRY_NAMES[letter],
    label: teamLabel(team.worldNumber, letter),
    members,
    roles,
    phase: state.phase,
    year: state.year,
    yearLabel: yearLabel(state.year),
    isPractice: state.year === 0,
    briefingSlide: state.briefingSlide,
    timing: timingView(state, now),
    between: betweenView(state.between),
    settings: publicSettings(state.settings),
    decision:
      decision === null
        ? null
        : {
            tenths: decision.tenths,
            auto: decision.auto,
            at: decision.at,
            byInstructor: decision.source === 'instructor',
          },
    submitted: decision !== null,
    submittedCount: open
      ? COUNTRY_LETTERS.filter((l) => open.decisions[l] !== undefined).length
      : 0,
    history: yearRowsFor(state, world, letter),
    reveal: revealFor(state, world, letter),
    // Only this world's channel, plus announcements that went to every world.
    messages: state.messages
      .filter((m) => m.worldId === team.worldId || m.worldId === null)
      .map(messageView),
    news: state.news.filter((n) => n.worldId === team.worldId || n.worldId === null).map(newsView),
    muted: team.muted,
    chatOpen: chatIsOpen(state) && !team.muted,
    huddle: huddle ? { suggestions: huddle.suggestions, reason: huddle.reason } : null,
    prediction: prediction
      ? { othersTenths: prediction.othersTenths, trust: prediction.trust }
      : null,
    reflection: team.reflection ? { answers: team.reflection.answers } : null,
    finalYearAnnounced: state.finalYearAnnounced,
    resultsRevealed: state.resultsRevealedToTeams,
    leaderboard: state.resultsRevealedToTeams ? leaderboardView(state) : null,
  };
}

// ---------------------------------------------------------------------------
// viewForProjector.
// ---------------------------------------------------------------------------

export interface ProjectorWorldView {
  worldNumber: number;
  /** Only after a reveal, and only when projectorShowsPrices is on. */
  priceCents: number | null;
  year: number | null;
}

export interface ProjectorTableRow {
  worldNumber: number;
  letter: CountryLetter;
  countryName: string;
  label: string;
  claimed: boolean;
}

export interface ProjectorView {
  kind: 'projector';
  sessionId: string;
  version: number;
  phase: Phase;
  year: number;
  yearLabel: string;
  briefingSlide: number;
  timing: TimingView;
  between: BetweenView | null;
  /** Instructor announcements only. Never a team's chat (SPEC section 7). */
  announcements: MessageView[];
  news: NewsView[];
  worlds: ProjectorWorldView[];
  /** The "Find your table" card in the lobby. */
  tables: ProjectorTableRow[];
  screen: ProjectorScreen;
  /** Which world a mirrored World Detail screen is about. */
  worldNumber: number | null;
  showsPrices: boolean;
  resultsRevealed: boolean;
  leaderboard: LeaderboardView | null;
  /**
   * The debrief, but only once the game has ended and the teacher has sent a
   * debrief screen here. Until then the projector carries none of it, so a world
   * can never see another world's numbers while there is still a year to play
   * (SPEC section 7, CLAUDE.md rule 8).
   */
  debrief: DebriefData | null;
}

export function viewForProjector(state: SessionState, now: number): ProjectorView {
  const showsPrices = state.settings.projectorShowsPrices;
  const atReveal = state.phase === 'PRACTICE_REVEAL' || state.phase === 'YEAR_REVEAL';

  return {
    kind: 'projector',
    sessionId: state.sessionId,
    version: state.version,
    phase: state.phase,
    year: state.year,
    yearLabel: yearLabel(state.year),
    briefingSlide: state.briefingSlide,
    timing: timingView(state, now),
    between: betweenView(state.between),
    announcements: state.messages.filter((m) => m.kind === 'announcement').map(messageView),
    news: state.news.map(newsView),
    worlds: state.worlds.map((world) => {
      const records = allRecords(world);
      const last = records[records.length - 1];
      const mayShow = showsPrices && atReveal && last !== undefined;
      return {
        worldNumber: world.worldNumber,
        priceCents: mayShow && last ? last.outcome.priceCents : null,
        year: mayShow && last ? last.year : null,
      };
    }),
    tables: state.worlds.flatMap((world) =>
      COUNTRY_LETTERS.map((letter) => {
        const team = state.teams[teamIdFor(world.worldId, letter)];
        return {
          worldNumber: world.worldNumber,
          letter,
          countryName: COUNTRY_NAMES[letter],
          label: teamLabel(world.worldNumber, letter),
          claimed: team?.claimed ?? false,
        };
      }),
    ),
    screen: state.projectorScreen,
    worldNumber: state.projectorWorldNumber ?? null,
    showsPrices,
    resultsRevealed: state.resultsRevealedToTeams,
    leaderboard: state.resultsRevealedToTeams ? leaderboardView(state) : null,
    // Cut down to the one screen the teacher sent, so the room is never sent a
    // world it is not looking at or a sentence no screen draws (SPEC section 7).
    debrief:
      state.phase === 'ENDED' && isDebriefScreen(state.projectorScreen)
        ? debriefForProjector(debriefFor(state), state.projectorScreen, state.projectorWorldNumber)
        : null,
  };
}

// ---------------------------------------------------------------------------
// viewForInstructor.
// ---------------------------------------------------------------------------

export interface InstructorTeamView {
  teamId: string;
  worldId: string;
  worldNumber: number;
  letter: CountryLetter;
  countryName: string;
  label: string;
  joinCode: string;
  claimed: boolean;
  connected: boolean;
  lastSeenAt: number | null;
  members: string[];
  roles: RoleAssignment;
  muted: boolean;
  pendingTakeover: boolean;
  decision: { tenths: number; auto: boolean; source: string; at: number } | null;
  /** Whether this year's huddle and prediction are in, for the live grid. */
  huddleRecorded: boolean;
  predictionRecorded: boolean;
  /** Every year's, keyed by year, because the debrief compares them (SPEC 8.4). */
  huddles: Record<number, { suggestions: Array<{ name: string; tenths: number }>; reason: string }>;
  predictions: Record<number, { othersTenths: number[]; trust: number }>;
  reflection: { answers: string[] } | null;
  cumulativeProfitK: number;
}

export interface InstructorWorldView {
  worldId: string;
  worldNumber: number;
  openYear: number | null;
  submittedCount: number;
  records: Array<{
    year: number;
    isPractice: boolean;
    priceCents: number;
    totalTenths: number;
    newProducerTenths: number;
    countries: Array<{
      letter: CountryLetter;
      targetTenths: number;
      actualTenths: number;
      auto: boolean;
      profitK: number;
      source: string;
    }>;
  }>;
}

export interface SuggestedAction {
  /** The command the one big button sends, or null when there is nothing to do. */
  command: string | null;
  label: string;
  payload: Record<string, unknown>;
  expectedPhase: Phase;
  expectedYear: number;
}

export interface InstructorView {
  kind: 'instructor';
  sessionId: string;
  version: number;
  instructorKey: string;
  projectorKey: string;
  seed: string;
  settings: Settings;
  phase: Phase;
  year: number;
  yearLabel: string;
  briefingSlide: number;
  timing: TimingView;
  between: BetweenView | null;
  finalYearAnnounced: boolean;
  resultsRevealedToTeams: boolean;
  projectorScreen: ProjectorScreen;
  projectorWorldNumber: number | null;
  suggested: SuggestedAction;
  worlds: InstructorWorldView[];
  teams: InstructorTeamView[];
  messages: MessageView[];
  /** Messages keyed by world, for the per-world chat feed. */
  messagesByWorld: Record<string, MessageView[]>;
  news: NewsView[];
  overrides: SessionState['overrides'];
  firedEvents: SessionState['firedEvents'];
  networkChecks: SessionState['networkChecks'];
  activitiesDone: string[];
  screens: { instructor: number; projector: number };
  leaderboard: LeaderboardView;
  /**
   * The debrief, once the game has ended. It is left out while the game is
   * running because it is a few hundred rows, views go out up to ten times a
   * second, and there is nothing to debrief until the last year is scored.
   */
  debrief: DebriefData | null;
  benchmarks: {
    competitiveEachTenths: number;
    competitivePriceCents: number;
    cooperativeShareTenths: number;
    cooperativeMaxK: number;
  };
}

/** Everything the instructor dashboard needs, live (SPEC section 7). */
export function viewForInstructor(
  state: SessionState,
  now: number,
  extras: {
    presence: Record<string, { connected: boolean; lastSeenAt: number | null }>;
    screens: { instructor: number; projector: number };
    suggested: SuggestedAction;
  },
): InstructorView {
  const year = Math.max(1, state.year);
  const competitive = competitiveOutcome(state.settings, year);
  const cooperative = cooperativeMax(state.settings, year);

  const teams: InstructorTeamView[] = Object.values(state.teams).map((team) => {
    const world = worldOf(state, team.worldId);
    const decision = world?.open?.decisions[team.letter] ?? null;
    const presence = extras.presence[team.teamId];
    const huddle = team.huddles[state.year];
    const prediction = team.predictions[state.year];
    return {
      teamId: team.teamId,
      worldId: team.worldId,
      worldNumber: team.worldNumber,
      letter: team.letter,
      countryName: COUNTRY_NAMES[team.letter],
      label: teamLabel(team.worldNumber, team.letter),
      joinCode: team.joinCode,
      claimed: team.claimed,
      connected: presence?.connected ?? false,
      lastSeenAt: presence?.lastSeenAt ?? null,
      members: team.members,
      roles: rolesForYear(
        team.members.length > 0 ? team.members : ['Member 1', 'Member 2', 'Member 3'],
        state.year,
        state.settings.rotateEvery,
      ),
      muted: team.muted,
      pendingTakeover: team.pendingTakeover !== null,
      decision:
        decision === null
          ? null
          : {
              tenths: decision.tenths,
              auto: decision.auto,
              source: decision.source,
              at: decision.at,
            },
      huddleRecorded: huddle !== undefined,
      predictionRecorded: prediction !== undefined,
      huddles: Object.fromEntries(
        Object.entries(team.huddles).map(([year, record]) => [
          year,
          { suggestions: record.suggestions, reason: record.reason },
        ]),
      ),
      predictions: Object.fromEntries(
        Object.entries(team.predictions).map(([year, record]) => [
          year,
          { othersTenths: record.othersTenths, trust: record.trust },
        ]),
      ),
      reflection: team.reflection ? { answers: team.reflection.answers } : null,
      cumulativeProfitK: world ? cumulativeProfitK(world, team.letter) : 0,
    };
  });

  const messagesByWorld: Record<string, MessageView[]> = {};
  for (const world of state.worlds) {
    messagesByWorld[world.worldId] = state.messages
      .filter((m) => m.worldId === world.worldId)
      .map(messageView);
  }

  return {
    kind: 'instructor',
    sessionId: state.sessionId,
    version: state.version,
    instructorKey: state.instructorKey,
    projectorKey: state.projectorKey,
    seed: state.seed,
    settings: state.settings,
    phase: state.phase,
    year: state.year,
    yearLabel: yearLabel(state.year),
    briefingSlide: state.briefingSlide,
    timing: timingView(state, now),
    between: betweenView(state.between),
    finalYearAnnounced: state.finalYearAnnounced,
    resultsRevealedToTeams: state.resultsRevealedToTeams,
    projectorScreen: state.projectorScreen,
    projectorWorldNumber: state.projectorWorldNumber ?? null,
    suggested: extras.suggested,
    worlds: state.worlds.map((world) => ({
      worldId: world.worldId,
      worldNumber: world.worldNumber,
      openYear: world.open ? world.open.year : null,
      submittedCount: world.open
        ? COUNTRY_LETTERS.filter((l) => world.open?.decisions[l] !== undefined).length
        : 0,
      records: allRecords(world).map((record) => ({
        year: record.year,
        isPractice: record.isPractice,
        priceCents: record.outcome.priceCents,
        totalTenths: record.outcome.totalTenths,
        newProducerTenths: record.outcome.newProducerTenths,
        countries: COUNTRY_LETTERS.map((letter) => ({
          letter,
          targetTenths: record.decisions[letter].tenths,
          actualTenths: record.outcome.countries[letter].actualTenths,
          auto: record.outcome.countries[letter].auto,
          profitK: record.outcome.countries[letter].profitK,
          source: record.decisions[letter].source,
        })),
      })),
    })),
    teams,
    messages: state.messages.map(messageView),
    messagesByWorld,
    news: state.news.map(newsView),
    overrides: state.overrides,
    firedEvents: state.firedEvents,
    networkChecks: state.networkChecks,
    activitiesDone: state.activitiesDone,
    screens: extras.screens,
    leaderboard: leaderboardView(state),
    debrief: state.phase === 'ENDED' ? debriefFor(state) : null,
    benchmarks: {
      competitiveEachTenths: competitive.eachTenths,
      competitivePriceCents: competitive.priceCents,
      cooperativeShareTenths: cooperative.shareTenths,
      cooperativeMaxK: cooperative.jointMaxK,
    },
  };
}

/** The view a terminal gets before it has claimed a team. */
export interface LobbyView {
  kind: 'lobby';
  sessionId: string;
  version: number;
  phase: Phase;
  timing: TimingView;
  /** True when at least one country is still free to claim. */
  anyFree: boolean;
}

export function viewForUnclaimedTeam(state: SessionState, now: number): LobbyView {
  return {
    kind: 'lobby',
    sessionId: state.sessionId,
    version: state.version,
    phase: state.phase,
    timing: timingView(state, now),
    anyFree: Object.values(state.teams).some((team) => !team.claimed),
  };
}
