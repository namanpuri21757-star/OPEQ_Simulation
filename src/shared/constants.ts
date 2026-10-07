/** Facts about the game that never change, shared by server, client and tests. */

export const APP_NAME = 'Crude Accord';
export const APP_TAGLINE = 'A classroom simulation of three countries sharing one oil market.';

/** Country letters are fixed, and so are their names (SPEC section 2). */
export const COUNTRY_LETTERS = ['A', 'B', 'C'] as const;
export type CountryLetter = (typeof COUNTRY_LETTERS)[number];

export const COUNTRY_NAMES: Record<CountryLetter, string> = {
  A: 'Ardonia',
  B: 'Borvia',
  C: 'Cendra',
};

export const MIN_WORLDS = 1;
export const MAX_WORLDS = 6;
export const DEFAULT_WORLDS = 3;

/**
 * Join codes leave out look-alike characters (0, O, 1, I, L) so a code read
 * off a printed card cannot be typed wrong (SPEC 8.2).
 */
export const JOIN_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const JOIN_CODE_LENGTH = 6;

/**
 * The network check (SPEC 8.6). Twenty pings is enough for a median that does
 * not swing on one slow packet, and 300 ms is the round trip SPEC section 9
 * asks 95% of acks to beat, so a computer slower than that is worth a word
 * before the lesson rather than during it.
 */
export const NETWORK_CHECK_PINGS = 20;
export const NETWORK_CHECK_OK_MS = 300;
