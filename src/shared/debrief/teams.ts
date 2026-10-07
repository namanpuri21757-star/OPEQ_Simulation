/**
 * What each group did that only the debrief sees: pledges, guesses and huddles
 * (SPEC sections 5 and 6, shown in SPEC 8.4).
 *
 * None of this is ever sent to another team. It reaches the instructor screen
 * and, when the teacher chooses, the projector, both of which are rooms the
 * teacher is standing in.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES, type CountryLetter } from '../constants.js';
import { roundDiv } from '../engine/integers.js';
import { teamIdFor, teamLabel } from '../labels.js';
import type { SessionState, TeamState, WorldState } from '../state.js';
import type {
  DebriefCountry,
  DebriefHuddleRow,
  DebriefMemberMatch,
  DebriefPrediction,
  DebriefYear,
} from './types.js';

/** The other two countries' actual output in one year, added together. */
function othersActualTenths(year: DebriefYear, letter: CountryLetter): number {
  return year.countries
    .filter((country) => country.letter !== letter)
    .reduce((sum, country) => sum + country.actualTenths, 0);
}

function predictionsFor(
  team: TeamState,
  years: readonly DebriefYear[],
  letter: CountryLetter,
): DebriefPrediction[] {
  const rows: DebriefPrediction[] = [];
  for (const year of years) {
    const record = team.predictions[year.year];
    if (!record) continue;
    const predicted = record.othersTenths.reduce((sum, value) => sum + value, 0);
    const actual = othersActualTenths(year, letter);
    rows.push({
      year: year.year,
      predictedTenths: predicted,
      actualTenths: actual,
      errorTenths: Math.abs(predicted - actual),
      trust: record.trust,
    });
  }
  return rows;
}

function huddlesFor(team: TeamState, years: readonly DebriefYear[]): DebriefHuddleRow[] {
  const rows: DebriefHuddleRow[] = [];
  for (const year of years) {
    const record = team.huddles[year.year];
    if (!record) continue;
    const decision =
      year.countries.find((country) => country.letter === team.letter)?.targetTenths ?? 0;
    rows.push({
      year: year.year,
      decisionTenths: decision,
      reason: record.reason,
      suggestions: record.suggestions.map((item) => ({
        name: item.name,
        tenths: item.tenths,
        matched: item.tenths === decision,
      })),
    });
  }
  return rows;
}

/**
 * How often each member's suggestion became the decision.
 *
 * Members are listed in the order the group typed their names, so a row exists
 * for someone who suggested nothing; the debrief question is about influence and
 * "suggested nothing" is part of that picture.
 */
function memberMatchesFor(
  team: TeamState,
  huddles: readonly DebriefHuddleRow[],
): DebriefMemberMatch[] {
  const counts = new Map<string, DebriefMemberMatch>();
  for (const name of team.members) counts.set(name, { name, suggestions: 0, matched: 0 });

  for (const huddle of huddles) {
    for (const suggestion of huddle.suggestions) {
      const row = counts.get(suggestion.name) ?? {
        name: suggestion.name,
        suggestions: 0,
        matched: 0,
      };
      row.suggestions += 1;
      if (suggestion.matched) row.matched += 1;
      counts.set(suggestion.name, row);
    }
  }
  return [...counts.values()];
}

/** One row per country in one world, in A, B, C order. */
export function countriesFor(
  state: SessionState,
  world: WorldState,
  years: readonly DebriefYear[],
): DebriefCountry[] {
  return COUNTRY_LETTERS.map((letter) => {
    const teamId = teamIdFor(world.worldId, letter);
    const team = state.teams[teamId];
    const last = years[years.length - 1];
    const own = last?.countries.find((country) => country.letter === letter);

    // One row per year this country had a pledge standing, so "kept 3 of 4"
    // counts only the years there was a promise to keep.
    const pledged = years.flatMap((year) => {
      const row = year.countries.find((country) => country.letter === letter);
      return row && row.pledgeTenths !== null ? [row] : [];
    });

    const predictions = team ? predictionsFor(team, years, letter) : [];
    const huddles = team ? huddlesFor(team, years) : [];
    const errors = predictions.reduce((sum, row) => sum + row.errorTenths, 0);
    const trust = predictions.reduce((sum, row) => sum + row.trust, 0);

    return {
      teamId,
      letter,
      countryName: COUNTRY_NAMES[letter],
      label: teamLabel(world.worldNumber, letter),
      members: team?.members ?? [],
      cumulativeProfitK: own?.cumulativeProfitK ?? 0,
      pledgesMade: pledged.length,
      pledgesKept: pledged.filter((row) => row.pledgeKept === true).length,
      predictions,
      meanPredictionErrorTenths:
        predictions.length === 0 ? null : roundDiv(errors, predictions.length),
      averageTrustTenths:
        predictions.length === 0 ? null : roundDiv(trust * 10, predictions.length),
      huddles,
      memberMatches: team ? memberMatchesFor(team, huddles) : [],
      reflection: team?.reflection ? team.reflection.answers : null,
    };
  });
}
