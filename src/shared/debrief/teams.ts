/**
 * What each group ended up with, per country, for the debrief (SPEC 8.4).
 *
 * None of this is ever sent to another team. It reaches the instructor screen
 * and, when the teacher chooses, the projector, both of which are rooms the
 * teacher is standing in.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES } from '../constants.js';
import { teamIdFor, teamLabel } from '../labels.js';
import type { SessionState, WorldState } from '../state.js';
import type { DebriefCountry, DebriefYear } from './types.js';

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

    return {
      teamId,
      letter,
      countryName: COUNTRY_NAMES[letter],
      label: teamLabel(world.worldNumber, letter),
      members: team?.members ?? [],
      cumulativeProfitK: own?.cumulativeProfitK ?? 0,
      messagesSent: state.messages.filter((message) => message.teamId === teamId).length,
      reflection: team?.reflection ? team.reflection.answers : null,
    };
  });
}
