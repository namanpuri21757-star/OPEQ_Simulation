/**
 * Properties that have to hold for every input, not just the spec's vectors.
 *
 * A vector test proves one case. These prove the shape of the rules: a price
 * floor, a price that only ever falls as supply rises, and three countries that
 * are treated identically no matter which letter they carry.
 */

import { describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS, type CountryLetter } from '@shared/constants.js';
import { PRESETS, economicUnits, parseSettings } from '@shared/settings.js';
import { priceCents, profitK, resolveWorldYear } from '@shared/engine/engine.js';
import { randomIntInclusive, seededRng } from '@shared/engine/rng.js';

const standard = PRESETS['standard-75'];
const units = economicUnits(standard);
const CASES = 2000;

function settle(tenths: [number, number, number], variancePct = 0) {
  const settings = variancePct === 0 ? standard : parseSettings({ variancePct });
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;
  COUNTRY_LETTERS.forEach((letter, index) => {
    targets[letter] = { tenths: tenths[index] ?? 0, auto: false };
  });
  return resolveWorldYear({
    settings,
    sessionSeed: 'properties',
    worldId: 'W1',
    year: 1,
    isPractice: false,
    targets,
  });
}

describe('price properties', () => {
  it('is never negative, however much the world produces', () => {
    const next = seededRng('never-negative');
    for (let i = 0; i < CASES; i += 1) {
      // Deliberately allow totals far past three capacities.
      const total = randomIntInclusive(next, 0, units.capacityTenths * 20);
      expect(priceCents(total, units.aCents, units.bHundredths)).toBeGreaterThanOrEqual(0);
    }
  });

  it('never rises when any one country produces more', () => {
    const next = seededRng('monotonic');
    for (let i = 0; i < CASES; i += 1) {
      const q: [number, number, number] = [
        randomIntInclusive(next, 0, units.capacityTenths),
        randomIntInclusive(next, 0, units.capacityTenths),
        randomIntInclusive(next, 0, units.capacityTenths),
      ];
      const which = randomIntInclusive(next, 0, 2);
      // Stay inside capacity: a target above it could never be submitted.
      const bigger = randomIntInclusive(next, q[which] ?? 0, units.capacityTenths);

      const before = settle(q).priceCents;
      const raised = q.map((value, index) => (index === which ? bigger : value)) as [
        number,
        number,
        number,
      ];
      const after = settle(raised).priceCents;

      expect(after).toBeLessThanOrEqual(before);
    }
  });

  it('is the same whichever order the three outputs arrive in', () => {
    const q: [number, number, number] = [120, 455, 702];
    const orders: Array<[number, number, number]> = [
      [120, 455, 702],
      [455, 702, 120],
      [702, 120, 455],
    ];
    for (const order of orders) {
      expect(settle(order).priceCents).toBe(settle(q).priceCents);
    }
  });
});

describe('the three countries are treated identically', () => {
  it('equal outputs give equal profits', () => {
    const next = seededRng('equal-profits');
    for (let i = 0; i < CASES; i += 1) {
      const each = randomIntInclusive(next, 0, units.capacityTenths);
      const o = settle([each, each, each]);
      const profits = COUNTRY_LETTERS.map((letter) => o.countries[letter].profitK);
      expect(new Set(profits).size).toBe(1);
    }
  });

  it('swapping two countries swaps their results', () => {
    const next = seededRng('swap');
    for (let i = 0; i < CASES; i += 1) {
      const a = randomIntInclusive(next, 0, units.capacityTenths);
      const b = randomIntInclusive(next, 0, units.capacityTenths);
      const c = randomIntInclusive(next, 0, units.capacityTenths);

      const plain = settle([a, b, c]);
      const swapped = settle([b, a, c]);

      expect(swapped.priceCents).toBe(plain.priceCents);
      expect(swapped.countries.A.profitK).toBe(plain.countries.B.profitK);
      expect(swapped.countries.B.profitK).toBe(plain.countries.A.profitK);
      expect(swapped.countries.C.profitK).toBe(plain.countries.C.profitK);
    }
  });

  it('a country that produces nothing earns nothing, whatever the price', () => {
    const next = seededRng('zero-output');
    for (let i = 0; i < CASES; i += 1) {
      const other = randomIntInclusive(next, 0, units.capacityTenths);
      const o = settle([0, other, other]);
      expect(o.countries.A.profitK).toBe(0);
    }
  });
});

describe('profit properties', () => {
  it('is negative only when the price is below cost', () => {
    const next = seededRng('loss-only-below-cost');
    for (let i = 0; i < CASES; i += 1) {
      const tenths = randomIntInclusive(next, 1, units.capacityTenths);
      const total = randomIntInclusive(next, 0, units.capacityTenths * 20);
      const price = priceCents(total, units.aCents, units.bHundredths);
      const earned = profitK(price, units.costCents, tenths);
      expect(earned < 0).toBe(price < units.costCents);
    }
  });

  it('rises with your own output while the price is above cost', () => {
    const o1 = settle([300, 383, 383]);
    const o2 = settle([301, 383, 383]);
    expect(o2.priceCents).toBeLessThanOrEqual(o1.priceCents);
    // One more tenth earns more here because the price stays well above cost.
    expect(o2.countries.A.profitK).toBeGreaterThan(o1.countries.A.profitK);
  });

  it('carries the auto marker and the target through untouched', () => {
    const settings = parseSettings({ variancePct: 5 });
    const o = resolveWorldYear({
      settings,
      sessionSeed: 'auto-marker',
      worldId: 'W1',
      year: 4,
      isPractice: false,
      targets: {
        A: { tenths: 400, auto: true },
        B: { tenths: 383, auto: false },
        C: { tenths: 575, auto: false },
      },
    });
    expect(o.countries.A.auto).toBe(true);
    expect(o.countries.B.auto).toBe(false);
    expect(o.countries.A.targetTenths).toBe(400);
    expect(o.countries.C.targetTenths).toBe(575);
  });
});
