/**
 * Production variance and determinism (SPEC section 3).
 *
 * The promise being tested: the same session seed, world, year and country always
 * give the same actual output, the draw never leaves the +/-v band once it has
 * been rounded and clamped, and turning variance off changes nothing at all.
 */

import { describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS, type CountryLetter } from '@shared/constants.js';
import { PRESETS, economicUnits, parseSettings } from '@shared/settings.js';
import { applyVariance, resolveWorldYear } from '@shared/engine/engine.js';
import { hashSeed, mulberry32, randomIntInclusive, seededRng } from '@shared/engine/rng.js';

const standard = PRESETS['standard-75'];
const units = economicUnits(standard);
const withVariance = parseSettings({ variancePct: 5 });

function settle(settings = standard, sessionSeed = 'seed-1', year = 4) {
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;
  for (const letter of COUNTRY_LETTERS) targets[letter] = { tenths: 383, auto: false };
  return resolveWorldYear({
    settings,
    sessionSeed,
    worldId: 'W1',
    year,
    isPractice: false,
    targets,
  });
}

describe('determinism', () => {
  it('gives identical results 1,000 times for the same seed and inputs', () => {
    const first = JSON.stringify(settle(withVariance));
    for (let i = 0; i < 1000; i += 1) {
      expect(JSON.stringify(settle(withVariance))).toBe(first);
    }
  });

  it('gives different draws for different session seeds', () => {
    let different = 0;
    const trials = 200;
    for (let i = 0; i < trials; i += 1) {
      const one = applyVariance(383, 5, ['seed-one', 'W1', i, 'A'], units.capacityTenths);
      const two = applyVariance(383, 5, ['seed-two', 'W1', i, 'A'], units.capacityTenths);
      if (one !== two) different += 1;
    }
    // Two unrelated seeds land on the same tenth now and then; most must differ.
    expect(different).toBeGreaterThan(trials / 2);
  });

  it('gives different draws for different worlds, years and countries', () => {
    const base = applyVariance(383, 5, ['s', 'W1', 4, 'A'], units.capacityTenths);
    const draws = [
      applyVariance(383, 5, ['s', 'W2', 4, 'A'], units.capacityTenths),
      applyVariance(383, 5, ['s', 'W1', 5, 'A'], units.capacityTenths),
      applyVariance(383, 5, ['s', 'W1', 4, 'B'], units.capacityTenths),
    ];
    expect(draws.some((d) => d !== base)).toBe(true);
  });

  it('separates seed parts, so hash(a, bc) and hash(ab, c) differ', () => {
    expect(hashSeed('a', 'bc')).not.toBe(hashSeed('ab', 'c'));
    expect(hashSeed('W1', 1)).toBe(hashSeed('W1', 1));
  });

  it('gives the same stream of numbers for the same mulberry32 seed', () => {
    const one = mulberry32(12345);
    const two = mulberry32(12345);
    for (let i = 0; i < 100; i += 1) expect(one()).toBe(two());
  });

  it('draws whole numbers inside the range it is given, both ends included', () => {
    const next = seededRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i += 1) {
      const value = randomIntInclusive(next, -2, 2);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      seen.add(value);
    }
    expect(seen.size).toBe(5);
    expect(randomIntInclusive(next, 7, 7)).toBe(7);
  });
});

describe('variance off', () => {
  it('leaves the actual output exactly equal to the target', () => {
    const next = seededRng('variance-off');
    for (let i = 0; i < 2000; i += 1) {
      const target = randomIntInclusive(next, 0, units.capacityTenths);
      expect(applyVariance(target, 0, ['s', 'W1', 1, 'A'], units.capacityTenths)).toBe(target);
    }
  });

  it('is off in every preset, so a class gets the plain rules unless asked', () => {
    for (const settings of Object.values(PRESETS)) expect(settings.variancePct).toBe(0);
  });

  it('settles a year with actual equal to target', () => {
    const o = settle();
    for (const letter of COUNTRY_LETTERS) {
      expect(o.countries[letter].actualTenths).toBe(383);
    }
  });
});

describe('variance at 5%', () => {
  const target = 383;
  const draws: number[] = [];
  for (let i = 0; i < 10_000; i += 1) {
    draws.push(applyVariance(target, 5, ['bounds', 'W1', i, 'A'], units.capacityTenths));
  }

  it('keeps all 10,000 draws inside plus or minus 5% after rounding and clamping', () => {
    for (const actual of draws) {
      expect(actual / target).toBeGreaterThanOrEqual(0.95);
      expect(actual / target).toBeLessThanOrEqual(1.05);
    }
  });

  it('averages close to the target, so variance adds noise and not a nudge', () => {
    const mean = draws.reduce((sum, d) => sum + d, 0) / draws.length;
    expect(Math.abs(mean / target - 1)).toBeLessThan(0.002);
  });

  it('actually moves the number, rather than quietly doing nothing', () => {
    expect(new Set(draws).size).toBeGreaterThan(10);
    expect(draws.some((d) => d !== target)).toBe(true);
  });

  it('never goes above capacity, even for a country already at capacity', () => {
    for (let i = 0; i < 2000; i += 1) {
      const actual = applyVariance(
        units.capacityTenths,
        5,
        ['at-capacity', 'W1', i, 'A'],
        units.capacityTenths,
      );
      expect(actual).toBeLessThanOrEqual(units.capacityTenths);
      expect(actual).toBeGreaterThanOrEqual(Math.ceil(units.capacityTenths * 0.95));
    }
  });

  it('leaves a target of 0 at 0, because 0 has nothing to vary', () => {
    expect(applyVariance(0, 5, ['zero', 'W1', 1, 'A'], units.capacityTenths)).toBe(0);
  });

  it('holds small targets inside their band, where rounding alone would not', () => {
    // 1.0 million with 5% variance can only be 1.0: 0.95 and 1.05 both round
    // back to it, and anything else would be more than 5% away.
    for (let i = 0; i < 500; i += 1) {
      expect(applyVariance(10, 5, ['small', 'W1', i, 'A'], units.capacityTenths)).toBe(10);
    }
  });

  it('clamps a target above capacity down to capacity', () => {
    expect(applyVariance(9999, 0, ['over', 'W1', 1, 'A'], units.capacityTenths)).toBe(
      units.capacityTenths,
    );
  });

  it('uses profit from the actual output, not the target', () => {
    const o = settle(parseSettings({ variancePct: 20 }), 'profit-from-actual');
    for (const letter of COUNTRY_LETTERS) {
      const country = o.countries[letter];
      expect(country.profitK).toBe((o.priceCents - units.costCents) * country.actualTenths);
    }
    // 20% is wide enough that at least one country moved off its target.
    expect(COUNTRY_LETTERS.some((l) => o.countries[l].actualTenths !== 383)).toBe(true);
  });
});
