/**
 * Integer arithmetic helpers.
 *
 * Why: money and quantities are stored as whole units (tenths of a million
 * barrels, cents, thousands of dollars) so two computers always agree. JavaScript
 * division produces floats, so every division in the engine goes through one of
 * these, which say out loud which way they round.
 */

/**
 * Rounds half away from zero: 2.5 becomes 3 and -2.5 becomes -3.
 *
 * Why not Math.round: Math.round sends -2.5 to -2, which would make a loss look
 * a hair smaller than the same-sized profit. Away from zero is the rule a
 * student is taught at school and the rule the displayed numbers follow.
 */
export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** numerator / divisor as a whole number, rounded half away from zero. */
export function roundDiv(numerator: number, divisor: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const n = Math.abs(numerator);
  const whole = Math.floor(n / divisor);
  const remainder = n - whole * divisor;
  return sign * (remainder * 2 >= divisor ? whole + 1 : whole);
}

/** numerator / divisor rounded down towards minus infinity. */
export function floorDiv(numerator: number, divisor: number): number {
  return Math.floor(numerator / divisor);
}

/** numerator / divisor rounded up towards plus infinity. */
export function ceilDiv(numerator: number, divisor: number): number {
  return Math.ceil(numerator / divisor);
}

/** Keeps value inside [low, high]. */
export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

/**
 * How many decimal places a number is written with. Returns a large number for
 * exponent notation (1e-7) so a value that fine is always rejected.
 */
export function decimalPlaces(value: number): number {
  const text = String(value);
  if (text.includes('e') || text.includes('E')) return 99;
  const dot = text.indexOf('.');
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Dollars to whole cents: 70.25 becomes 7025. */
export function toCents(dollars: number): number {
  return roundHalfAwayFromZero(dollars * 100);
}

/** Dollars to whole hundredths: 0.3 becomes 30. Used for the slope b. */
export function toHundredths(value: number): number {
  return roundHalfAwayFromZero(value * 100);
}

/** Millions of barrels to whole tenths: 38.3 becomes 383. */
export function toTenths(millions: number): number {
  return roundHalfAwayFromZero(millions * 10);
}
