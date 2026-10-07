/**
 * The debrief: everything the screens at the end of the lesson show (SPEC 8.4).
 *
 * One pure function of the session state. The server works it out and puts it in
 * the instructor's view, and in the projector's view when the teacher sends a
 * debrief screen there, so the two screens can never disagree about a number or
 * a title (CLAUDE.md rules 1 and 2).
 *
 * The titles are part of the data on purpose. Each debrief screen is headed by
 * its own finding in plain words - "World 2 kept 91% of the cooperative
 * maximum" - and a finding is a number, so it belongs with the numbers rather
 * than being written by hand in a component where no test would see it.
 */

import type { SessionState } from './state.js';
import { formatProfitK } from './units.js';
import { countriesFor } from './debrief/teams.js';
import { questionsFor } from './debrief/questions.js';
import { theoryFor } from './debrief/theory.js';
import { breakFor, markersFor, messagesFor, percentOf, yearsFor } from './debrief/world.js';
import { COOPERATION_RUN } from './debrief/types.js';
import type {
  DebriefData,
  DebriefLeaderboard,
  DebriefTheory,
  DebriefTitles,
  DebriefWorld,
} from './debrief/types.js';

export * from './debrief/types.js';
export { percentOf, pledgeKept } from './debrief/world.js';
export { THEORY_YEAR, theoryFor } from './debrief/theory.js';
export { questionsFor } from './debrief/questions.js';

/** The finding at the top of one world's detail screen. */
function worldTitle(world: Omit<DebriefWorld, 'title'>): string {
  if (world.years.length === 0) return `${world.label} played no scored years.`;
  const kept = `${world.label} kept ${String(world.percentOfMax)}% of the cooperative maximum`;
  if (world.break.year !== null) {
    return `${kept} and held together until Year ${String(world.break.year)}.`;
  }
  if (world.break.longestRun >= COOPERATION_RUN) return `${kept} and never broke its agreement.`;
  return world.break.longestRun > 0
    ? `${kept}, but never held an agreement for more than a year.`
    : `${kept} and never settled on an agreement.`;
}

function leaderboardFor(worlds: readonly DebriefWorld[]): DebriefLeaderboard {
  const countries = worlds.flatMap((world) =>
    world.countries.map((country) => ({
      worldNumber: world.worldNumber,
      letter: country.letter,
      countryName: country.countryName,
      label: country.label,
      cumulativeProfitK: country.cumulativeProfitK,
    })),
  );
  const rows = worlds.map((world) => ({
    worldNumber: world.worldNumber,
    label: world.label,
    totalProfitK: world.totalProfitK,
    cooperativeMaxK: world.cooperativeMaxK,
    percentOfMax: world.percentOfMax,
  }));

  countries.sort((x, y) => y.cumulativeProfitK - x.cumulativeProfitK);
  rows.sort((x, y) => y.totalProfitK - x.totalProfitK);
  return { countries, worlds: rows };
}

function comparisonTitle(worlds: readonly DebriefWorld[]): string {
  const played = worlds.filter((world) => world.years.length > 0);
  const best = played[0];
  if (!best) return 'No years have been scored yet.';
  if (played.length === 1) {
    return `${best.label} kept ${String(best.percentOfMax)}% of the cooperative maximum.`;
  }
  const ranked = [...played].sort((x, y) => y.percentOfMax - x.percentOfMax);
  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  if (!top || !bottom) return 'No years have been scored yet.';
  if (top.percentOfMax === bottom.percentOfMax) {
    return `Every world kept ${String(top.percentOfMax)}% of the cooperative maximum.`;
  }
  return `${top.label} came closest, keeping ${String(top.percentOfMax)}% of the cooperative maximum, and ${bottom.label} kept ${String(bottom.percentOfMax)}%.`;
}

function leaderboardTitle(leaderboard: DebriefLeaderboard): string {
  const top = leaderboard.countries[0];
  if (!top) return 'Nobody has earned anything yet.';
  const sameAsNext = leaderboard.countries[1]?.cumulativeProfitK === top.cumulativeProfitK;
  if (sameAsNext) {
    return `Two or more countries tied at the top with ${formatProfitK(top.cumulativeProfitK)}.`;
  }
  return `${top.label} earned the most, ${formatProfitK(top.cumulativeProfitK)}.`;
}

function theoryTitle(theory: DebriefTheory): string {
  const played = theory.landings.filter((landing) => landing.averageTotalTenths > 0);
  if (played.length === 0) return 'No world has produced anything yet.';
  const cooperative = played.filter((landing) => landing.landing === 'cooperative').length;
  const competitiveOrMore = played.filter(
    (landing) => landing.landing === 'competitive' || landing.landing === 'beyond',
  ).length;

  if (cooperative === played.length) {
    return 'Every world held close to the cooperative total all game.';
  }
  if (competitiveOrMore === played.length) {
    return 'Every world ended up producing about as much as full competition.';
  }
  return `${String(cooperative)} of ${String(played.length)} worlds held near the cooperative total; the rest drifted towards competition.`;
}

/** Everything the debrief screens need, from the session state alone. */
export function debriefFor(state: SessionState): DebriefData {
  const worlds: DebriefWorld[] = state.worlds.map((world) => {
    const years = yearsFor(state, world);
    const last = years[years.length - 1];
    const partial: Omit<DebriefWorld, 'title'> = {
      worldId: world.worldId,
      worldNumber: world.worldNumber,
      label: `World ${String(world.worldNumber)}`,
      years,
      countries: countriesFor(state, world, years),
      totalProfitK: last?.cumulativeJointProfitK ?? 0,
      cooperativeMaxK: last?.cumulativeCooperativeMaxK ?? 0,
      percentOfMax: percentOf(
        last?.cumulativeJointProfitK ?? 0,
        last?.cumulativeCooperativeMaxK ?? 0,
      ),
      break: breakFor(years),
      markers: markersFor(state, world),
      messages: messagesFor(state, world),
    };
    return { ...partial, title: worldTitle(partial) };
  });

  const leaderboard = leaderboardFor(worlds);
  const theory = theoryFor(state.settings, worlds);
  const years = [...new Set(worlds.flatMap((world) => world.years.map((year) => year.year)))].sort(
    (x, y) => x - y,
  );

  const titles: DebriefTitles = {
    comparison: comparisonTitle(worlds),
    leaderboard: leaderboardTitle(leaderboard),
    gameTheory: theoryTitle(theory),
    questions: 'Ten questions, with your class’s own numbers in them.',
  };

  return {
    years,
    worlds,
    leaderboard,
    theory,
    questions: questionsFor(state.settings, theory),
    titles,
    empty: years.length === 0,
  };
}

/**
 * The same debrief, cut down to what one mirrored screen actually draws.
 *
 * SPEC section 7 says the projector never carries team-private data; SPEC 8.5
 * says it shows whatever the instructor sends. Both are true at once only if the
 * projector is sent the screen rather than the whole dataset: World Detail draws
 * one world's message timeline, its guesses and whose suggestion won, so the
 * room sees that world's - and nothing of the other worlds', and nothing that no
 * screen ever draws.
 *
 * What is always taken out:
 *  - every reflection, which no debrief screen shows and which is the most
 *    personal thing a student writes,
 *  - every huddle reason, which no debrief screen shows either.
 * What is taken out unless this is the world on screen:
 *  - messages, predictions, huddles, and the members' first names.
 */
export function debriefForProjector(
  data: DebriefData,
  screen: string,
  worldNumber: number | null,
): DebriefData {
  // World Detail falls back to the first world when the number matches none, so
  // the trimming has to fall back the same way or the room would see a chart
  // with no timeline under it.
  const shown =
    screen === 'worldDetail'
      ? (data.worlds.find((world) => world.worldNumber === worldNumber) ?? data.worlds[0])
      : undefined;

  return {
    ...data,
    worlds: data.worlds.map((world) => {
      const onScreen = shown !== undefined && world.worldId === shown.worldId;
      return {
        ...world,
        messages: onScreen ? world.messages : [],
        countries: world.countries.map((country) => ({
          ...country,
          members: onScreen ? country.members : [],
          predictions: onScreen ? country.predictions : [],
          huddles: onScreen ? country.huddles.map((row) => ({ ...row, reason: '' })) : [],
          memberMatches: onScreen ? country.memberMatches : [],
          reflection: null,
        })),
      };
    }),
  };
}
