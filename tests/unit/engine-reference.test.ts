/**
 * A second, independent implementation of the economics, written the obvious way
 * in plain floating-point dollars, checked against the engine on 10,000 seeded
 * random cases.
 *
 * Why bother: the engine works in whole cents and whole thousands of dollars to
 * stay exact, which means its arithmetic looks nothing like the formula in the
 * spec. This test is the bridge. If the two ever disagree by more than rounding,
 * one of them has a bug.
 */

import { describe, expect, it } from 'vitest';
import { economicUnits, parseSettings, type Settings } from '@shared/settings.js';
import { priceCents, profitK } from '@shared/engine/engine.js';
import { randomIntInclusive, seededRng } from '@shared/engine/rng.js';

const CASES = 10_000;

/** The formula straight out of SPEC section 3, in dollars and millions. */
function referencePrice(a: number, b: number, totalMillions: number): number {
  return Math.max(0, a - b * totalMillions);
}

/** Profit in millions of dollars. */
function referenceProfit(price: number, cost: number, ownMillions: number): number {
  return (price - cost) * ownMillions;
}

describe('the engine agrees with a plain floating-point reference', () => {
  it('matches on 10,000 seeded random cases', () => {
    const next = seededRng('reference-check', CASES);
    let worstPriceGap = 0;
    let worstProfitGap = 0;

    for (let i = 0; i < CASES; i += 1) {
      // Vary the settings too, so the test does not only cover a = 70, b = 0.3.
      const capacityTenths = randomIntInclusive(next, 10, 1200);
      const settings: Settings = parseSettings({
        a: randomIntInclusive(next, 2000, 12000) / 100,
        b: randomIntInclusive(next, 1, 200) / 100,
        cost: randomIntInclusive(next, 0, 150) / 100,
        capacity: capacityTenths / 10,
        startingOutput: randomIntInclusive(next, 0, capacityTenths) / 10,
      });
      const u = economicUnits(settings);

      const q = [0, 1, 2].map(() => randomIntInclusive(next, 0, u.capacityTenths));
      const totalTenths = q.reduce((sum, tenths) => sum + tenths, 0);

      const price = priceCents(totalTenths, u.aCents, u.bHundredths);
      const expectedPrice = referencePrice(settings.a, settings.b, totalTenths / 10);
      worstPriceGap = Math.max(worstPriceGap, Math.abs(price / 100 - expectedPrice));
      // Half a cent: the engine rounds the price to a whole cent, the reference
      // does not round at all.
      expect(Math.abs(price / 100 - expectedPrice)).toBeLessThanOrEqual(0.005 + 1e-9);

      for (const tenths of q) {
        const engineProfitM = profitK(price, u.costCents, tenths) / 1000;
        const expectedProfitM = referenceProfit(expectedPrice, settings.cost, tenths / 10);
        const gap = Math.abs(engineProfitM - expectedProfitM);
        worstProfitGap = Math.max(worstProfitGap, gap);
        // Half a thousand dollars is 0.0005 million. The rounded price can be
        // half a cent off, and that half cent is multiplied by the country's
        // own output, so the allowance grows with how much it produced.
        expect(gap).toBeLessThanOrEqual(0.0005 + 0.005 * (tenths / 10) + 1e-9);
      }
    }

    // A sanity check on the test itself: if the reference were accidentally
    // identical to the engine these gaps would both be 0.
    expect(worstPriceGap).toBeGreaterThan(0);
    expect(worstProfitGap).toBeGreaterThan(0);
  });

  it('matches to half a cent and half a thousand dollars at the default settings', () => {
    const settings = parseSettings({});
    const u = economicUnits(settings);
    const next = seededRng('reference-defaults');

    for (let i = 0; i < CASES; i += 1) {
      const q = [0, 1, 2].map(() => randomIntInclusive(next, 0, u.capacityTenths));
      const totalTenths = q.reduce((sum, tenths) => sum + tenths, 0);
      const price = priceCents(totalTenths, u.aCents, u.bHundredths);
      const expectedPrice = referencePrice(settings.a, settings.b, totalTenths / 10);

      // With a = 70 and b = 0.3 every price is a whole cent, so these agree exactly.
      expect(Math.abs(price / 100 - expectedPrice)).toBeLessThanOrEqual(0.005 + 1e-9);
      for (const tenths of q) {
        const gap = Math.abs(
          profitK(price, u.costCents, tenths) / 1000 -
            referenceProfit(expectedPrice, settings.cost, tenths / 10),
        );
        expect(gap).toBeLessThanOrEqual(0.0005 + 1e-9);
      }
    }
  });
});
