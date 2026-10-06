/**
 * The only source of randomness in the game.
 *
 * Why not Math.random: SPEC section 3 requires that the same session seed,
 * world, year and country always give the same variance draw, so a reveal can
 * be replayed from the event log and a test can assert an exact number.
 *
 * Why the generator yields 32-bit integers instead of a float in [0, 1):
 * quantities are integer tenths, so a float step would only be rounded away
 * again. Staying in integers keeps every draw reproducible on any machine.
 */

const UINT32 = 4294967296; // 2^32

/** A character no seed part will contain, so the parts cannot run together. */
const SEPARATOR = String.fromCharCode(0);

/**
 * FNV-1a, 32 bit. Small, fast and stable across Node versions, which matters
 * because a saved session has to replay to the same numbers next week.
 */
export function hashSeed(...parts: Array<string | number>): number {
  // A separator so hash('a', 'bc') and hash('ab', 'c') differ.
  const text = parts.join(SEPARATOR);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A mulberry32 generator. Each call returns the next 32-bit unsigned integer. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** The generator for one draw, seeded from the parts SPEC section 3 lists. */
export function seededRng(...parts: Array<string | number>): () => number {
  return mulberry32(hashSeed(...parts));
}

/**
 * A whole number in [min, max], both ends included and every value equally
 * likely. Rejection sampling (rather than a plain modulo) removes the bias that
 * would otherwise make the low end of the variance range slightly more common.
 */
export function randomIntInclusive(next: () => number, min: number, max: number): number {
  const span = max - min + 1;
  if (span <= 1) return min;
  const limit = UINT32 - (UINT32 % span);
  let draw = next();
  while (draw >= limit) draw = next();
  return min + (draw % span);
}
