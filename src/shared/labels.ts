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
