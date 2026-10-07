/**
 * The exports (SPEC 8.4): six CSV files and one full JSON file.
 *
 * Pure functions of the session state, so a test can compare an export with the
 * stored outcomes directly and the server only has to add the HTTP headers.
 *
 * Two rules run through all of them. Every column heading names its unit, so
 * nobody has to guess whether 383 is barrels or tenths. And nothing secret
 * leaves: no instructor key, no projector key, no terminal token.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES, type CountryLetter } from './constants.js';
import { csvDocument, isoTime, yesNo, yesNoBlank } from './csv.js';
import { debriefFor } from './debrief.js';
import { cooperativeMax } from './engine/engine.js';
import { teamIdFor, yearLabel } from './labels.js';
import type { SessionState, WorldState, WorldYearRecord } from './state.js';
import { percentOf } from './debrief/world.js';
import { priceNumber, profitNumber, quantityNumber } from './units.js';

/** The practice row comes first, then the scored years in order. */
function recordsOf(world: WorldState): WorldYearRecord[] {
  return world.practice ? [world.practice, ...world.years] : [...world.years];
}

/** Every decision, including the ones the server filled in at close. */
export function decisionsCsv(state: SessionState): string {
  const rows: string[][] = [];
  for (const world of state.worlds) {
    for (const record of recordsOf(world)) {
      for (const letter of COUNTRY_LETTERS) {
        const decision = record.decisions[letter];
        const outcome = record.outcome.countries[letter];
        rows.push([
          String(world.worldNumber),
          String(record.year),
          yearLabel(record.year),
          yesNo(record.isPractice),
          letter,
          COUNTRY_NAMES[letter],
          quantityNumber(decision.tenths),
          quantityNumber(outcome.actualTenths),
          yesNo(decision.auto),
          decision.source,
          decision.reason ?? '',
          isoTime(decision.at),
        ]);
      }
    }
  }
  return csvDocument(
    [
      'World',
      'Year',
      'Year label',
      'Practice',
      'Letter',
      'Country',
      'Target (million barrels)',
      'Actual output (million barrels)',
      'Filled in by the server',
      'Entered by',
      'Override reason',
      'Decided at (UTC)',
    ],
    rows,
  );
}

/** Every settled year: the price, the supply, each country's profit. */
export function outcomesCsv(state: SessionState): string {
  const rows: string[][] = [];
  for (const world of state.worlds) {
    const cumulative: Record<CountryLetter, number> = { A: 0, B: 0, C: 0 };
    for (const record of recordsOf(world)) {
      const benchmark = cooperativeMax(state.settings, record.year);
      const joint = COUNTRY_LETTERS.reduce(
        (sum, letter) => sum + record.outcome.countries[letter].profitK,
        0,
      );
      for (const letter of COUNTRY_LETTERS) {
        const outcome = record.outcome.countries[letter];
        if (!record.isPractice) cumulative[letter] += outcome.profitK;
        rows.push([
          String(world.worldNumber),
          String(record.year),
          yearLabel(record.year),
          yesNo(record.isPractice),
          letter,
          COUNTRY_NAMES[letter],
          quantityNumber(outcome.actualTenths),
          priceNumber(record.outcome.priceCents),
          profitNumber(outcome.profitK),
          profitNumber(record.isPractice ? 0 : cumulative[letter]),
          quantityNumber(record.outcome.totalTenths),
          quantityNumber(record.outcome.newProducerTenths),
          profitNumber(joint),
          profitNumber(benchmark.jointMaxK),
          String(percentOf(joint, benchmark.jointMaxK)),
          isoTime(record.closedAt),
        ]);
      }
    }
  }
  return csvDocument(
    [
      'World',
      'Year',
      'Year label',
      'Practice',
      'Letter',
      'Country',
      'Actual output (million barrels)',
      'Price ($ per barrel)',
      'Profit ($ millions)',
      'Cumulative profit ($ millions)',
      'World supply (million barrels)',
      'Other suppliers (million barrels)',
      'World profit this year ($ millions)',
      'Cooperative maximum ($ millions)',
      'Percent of cooperative maximum',
      'Year closed at (UTC)',
    ],
    rows,
  );
}

/** Every message, with each pledge marked kept or broken. */
export function messagesCsv(state: SessionState): string {
  const debrief = debriefFor(state);
  const rows: string[][] = [];

  for (const world of debrief.worlds) {
    for (const message of world.messages) {
      // An announcement went to every world, so it appears once per world; the
      // World column says which room was reading it.
      rows.push([
        String(world.worldNumber),
        message.year === null ? '' : String(message.year),
        message.kind,
        message.letter ?? '',
        message.countryName ?? 'Instructor',
        message.text,
        message.tenths === undefined ? '' : quantityNumber(message.tenths),
        message.actualTenths === null ? '' : quantityNumber(message.actualTenths),
        yesNoBlank(message.kept),
        isoTime(message.at),
      ]);
    }
  }

  return csvDocument(
    [
      'World',
      'Year it came before',
      'Kind',
      'Letter',
      'Who wrote it',
      'Text',
      'Promised (million barrels)',
      'Actual output (million barrels)',
      'Promise kept',
      'Sent at (UTC)',
    ],
    rows,
  );
}

/** What each group expected the other two to produce, and how much it trusted them. */
export function predictionsCsv(state: SessionState): string {
  const debrief = debriefFor(state);
  const rows = debrief.worlds.flatMap((world) =>
    world.countries.flatMap((country) =>
      country.predictions.map((row) => [
        String(world.worldNumber),
        country.letter,
        country.countryName,
        String(row.year),
        quantityNumber(row.predictedTenths),
        quantityNumber(row.actualTenths),
        quantityNumber(row.errorTenths),
        String(row.trust),
      ]),
    ),
  );
  return csvDocument(
    [
      'World',
      'Letter',
      'Country',
      'Year',
      'Guess for the other two (million barrels)',
      'What they really produced (million barrels)',
      'How far out (million barrels)',
      'Trust (1 to 5)',
    ],
    rows,
  );
}

/** Each member's suggestion beside the number the group actually sent. */
export function huddlesCsv(state: SessionState): string {
  const debrief = debriefFor(state);
  const rows = debrief.worlds.flatMap((world) =>
    world.countries.flatMap((country) =>
      country.huddles.flatMap((huddle) =>
        huddle.suggestions.map((suggestion) => [
          String(world.worldNumber),
          country.letter,
          country.countryName,
          String(huddle.year),
          suggestion.name,
          quantityNumber(suggestion.tenths),
          quantityNumber(huddle.decisionTenths),
          yesNo(suggestion.matched),
          huddle.reason,
        ]),
      ),
    ),
  );
  return csvDocument(
    [
      'World',
      'Letter',
      'Country',
      'Year',
      'Member',
      'Suggested (million barrels)',
      'Group decision (million barrels)',
      'Suggestion became the decision',
      'Reason the group gave',
    ],
    rows,
  );
}

/** The three questions each group answered at the end (SPEC 8.3). */
export const REFLECTION_QUESTIONS = [
  'When did your world cooperate best, and why?',
  'Did any promise get broken, and how did your group react?',
  'What would you do differently?',
] as const;

export function reflectionsCsv(state: SessionState): string {
  const rows: string[][] = [];
  for (const world of state.worlds) {
    for (const letter of COUNTRY_LETTERS) {
      const team = state.teams[teamIdFor(world.worldId, letter)];
      if (!team?.reflection) continue;
      rows.push([
        String(world.worldNumber),
        letter,
        COUNTRY_NAMES[letter],
        team.members.join('; '),
        ...REFLECTION_QUESTIONS.map((_, index) => team.reflection?.answers[index] ?? ''),
        isoTime(team.reflection.at),
      ]);
    }
  }
  return csvDocument(
    ['World', 'Letter', 'Country', 'Members', ...REFLECTION_QUESTIONS, 'Saved at (UTC)'],
    rows,
  );
}

/**
 * The whole game in one JSON file.
 *
 * Built field by field rather than from the state object, so the keys and the
 * terminal tokens cannot leak into it the day someone adds a field to the state
 * (CLAUDE.md rule 2, the same reasoning as the views).
 */
export function fullJson(state: SessionState): string {
  const debrief = debriefFor(state);

  const bundle = {
    app: 'crude-accord',
    schema: state.schema,
    session: {
      sessionId: state.sessionId,
      seed: state.seed,
      createdAt: isoTime(state.createdAt),
      updatedAt: isoTime(state.updatedAt),
      phase: state.phase,
      year: state.year,
      finalYearAnnounced: state.finalYearAnnounced,
      resultsRevealedToTeams: state.resultsRevealedToTeams,
    },
    settings: state.settings,
    worlds: state.worlds.map((world) => ({
      worldNumber: world.worldNumber,
      practice: world.practice,
      years: world.years,
    })),
    teams: Object.values(state.teams).map((team) => ({
      worldNumber: team.worldNumber,
      letter: team.letter,
      countryName: COUNTRY_NAMES[team.letter],
      members: team.members,
      claimed: team.claimed,
      muted: team.muted,
      huddles: team.huddles,
      predictions: team.predictions,
      reflection: team.reflection,
    })),
    messages: state.messages.map((message) => ({
      worldNumber:
        state.worlds.find((world) => world.worldId === message.worldId)?.worldNumber ?? null,
      kind: message.kind,
      letter: message.letter,
      text: message.text,
      ...(message.tenths === undefined ? {} : { tenths: message.tenths }),
      at: isoTime(message.at),
    })),
    news: state.news,
    overrides: state.overrides.map((override) => ({
      ...override,
      at: isoTime(override.at),
    })),
    firedEvents: state.firedEvents,
    activitiesDone: state.activitiesDone,
    debrief,
  };

  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export type ExportName =
  'decisions' | 'outcomes' | 'messages' | 'predictions' | 'huddles' | 'reflections' | 'session';

export interface ExportFile {
  name: ExportName;
  /** The file name offered to the browser, without the session id. */
  fileName: string;
  /** What the button says. */
  label: string;
  contentType: string;
  build(state: SessionState): string;
}

/** The seven files, in the order the buttons appear. */
export const EXPORT_FILES: readonly ExportFile[] = [
  {
    name: 'decisions',
    fileName: 'decisions.csv',
    label: 'Decisions (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: decisionsCsv,
  },
  {
    name: 'outcomes',
    fileName: 'outcomes.csv',
    label: 'Results by year (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: outcomesCsv,
  },
  {
    name: 'messages',
    fileName: 'messages.csv',
    label: 'Messages and promises (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: messagesCsv,
  },
  {
    name: 'predictions',
    fileName: 'predictions.csv',
    label: 'Guesses and trust (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: predictionsCsv,
  },
  {
    name: 'huddles',
    fileName: 'huddles.csv',
    label: 'Huddles (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: huddlesCsv,
  },
  {
    name: 'reflections',
    fileName: 'reflections.csv',
    label: 'Reflections (CSV)',
    contentType: 'text/csv; charset=utf-8',
    build: reflectionsCsv,
  },
  {
    name: 'session',
    fileName: 'session.json',
    label: 'Everything (JSON)',
    contentType: 'application/json; charset=utf-8',
    build: fullJson,
  },
];

export function exportFile(name: string): ExportFile | undefined {
  return EXPORT_FILES.find((file) => file.name === name);
}
