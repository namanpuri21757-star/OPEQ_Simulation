import { COUNTRY_NAMES, type CountryLetter } from './constants.js';

/**
 * One way to name a team everywhere it appears, so a card, a dashboard cell
 * and an alert always read the same: "World 2 - Borvia (B)" (SPEC section 2).
 */
export function teamLabel(worldNumber: number, letter: CountryLetter): string {
  return `World ${worldNumber} - ${COUNTRY_NAMES[letter]} (${letter})`;
}

/** The year as students see it: "PRACTICE" or "Year 5" (SPEC 8.3). */
export function yearLabel(year: number): string {
  return year === 0 ? 'PRACTICE' : `Year ${year}`;
}

/**
 * The one place a team id is spelled, so every file agrees.
 *
 * It lives beside the labels rather than in views.ts because the debrief needs
 * it too, and views.ts imports the debrief: one of the two had to move down.
 */
export function teamIdFor(worldId: string, letter: CountryLetter): string {
  return `${worldId}-${letter}`;
}
