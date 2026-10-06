/**
 * Every random identifier the server hands out.
 *
 * All of them come from node:crypto, never Math.random, because an instructor
 * key that someone could guess would let a student open the dashboard. The game
 * economics use their own seeded generator (src/shared/engine/rng.ts) and never
 * touch this file: those draws must repeat exactly, these must not repeat at all.
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '../shared/constants.js';

/** Base32-ish, no padding, so a key is safe in a URL and easy to read aloud. */
function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

/** SPEC section 9 asks for at least 24 characters. 24 bytes gives 32. */
export function newInstructorKey(): string {
  return randomToken(24);
}

export function newProjectorKey(): string {
  return randomToken(24);
}

export function newTerminalToken(): string {
  return randomToken(24);
}

export function newSessionId(): string {
  return randomToken(8);
}

/** The seed for all variance draws. Created once and saved with the session. */
export function newSessionSeed(): string {
  return randomToken(12);
}

export function newId(): string {
  return randomUUID();
}

/** A join code with no look-alike characters (SPEC 8.2). */
export function newJoinCode(): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** As many different join codes as asked for. */
export function newJoinCodes(count: number): string[] {
  const codes = new Set<string>();
  while (codes.size < count) codes.add(newJoinCode());
  return [...codes];
}
