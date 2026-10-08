/**
 * The one scheduled event, and how the benchmarks move once it lands.
 *
 * SPEC section 4: the new producer enters at the start of its year and stays,
 * and never appears in the practice year, which is year 0. The demand event v1
 * had is gone, so `a` no longer moves during a game at all.
 */

import { describe, expect, it } from 'vitest';
import { PRESETS, economicUnits, parseSettings } from '@shared/settings.js';
import {
  bestResponseRawTenths,
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  newProducerTenths,
} from '@shared/engine/engine.js';

const standard = PRESETS['standard-75'];

describe('the new producer', () => {
  it('is absent before its year and present from its year on', () => {
    expect(newProducerTenths(0, standard)).toBe(0);
    expect(newProducerTenths(8, standard)).toBe(0);
    expect(newProducerTenths(9, standard)).toBe(150);
    expect(newProducerTenths(12, standard)).toBe(150);
  });

  it('stays away when it is switched off', () => {
    const off = parseSettings({ newProducer: { enabled: false } });
    for (const year of [0, 1, 9, 12]) expect(newProducerTenths(year, off)).toBe(0);
  });

  it('lowers both benchmarks, because the three countries now share the market', () => {
    const before = cooperativeMax(standard, 8);
    const after = cooperativeMax(standard, 9);
    expect(after.totalTenths).toBeLessThan(before.totalTenths);
    expect(after.jointMaxK).toBeLessThan(before.jointMaxK);
    // The newcomer's barrels are not the three countries' to hold back, so the
    // best they can do is cut their own total by half of what it produces.
    expect(before.totalTenths - after.totalTenths).toBe(after.newProducerTenths / 2);

    const nashBefore = competitiveOutcome(standard, 8);
    const nashAfter = competitiveOutcome(standard, 9);
    expect(nashAfter.eachTenths).toBeLessThan(nashBefore.eachTenths);
    expect(nashAfter.eachProfitK).toBeLessThan(nashBefore.eachProfitK);
  });

  it('is counted as other supply by the best response', () => {
    // Two rivals at 38.3 each plus a newcomer at 15.
    expect(bestResponseTenths(766 + 150, standard)).toBeLessThan(
      bestResponseTenths(766, standard),
    );
  });
});

describe('the benchmarks at the edges', () => {
  it('asks for 0 when the others have already pushed the price under cost', () => {
    const { capacityTenths } = economicUnits(standard);
    const flooded = capacityTenths * 10;
    expect(bestResponseRawTenths(flooded, standard)).toBeLessThan(0);
    expect(bestResponseTenths(flooded, standard)).toBe(0);
  });

  it('caps the cooperative total at three capacities when demand is huge', () => {
    const huge = parseSettings({ a: 999, b: 0.01, cost: 1 });
    const coop = cooperativeMax(huge, 1);
    expect(coop.totalTenths).toBe(3 * economicUnits(huge).capacityTenths);
    expect(coop.shareTenths).toBe(economicUnits(huge).capacityTenths);
  });

  it('caps each country at capacity in the competitive outcome', () => {
    const huge = parseSettings({ a: 999, b: 0.01, cost: 1 });
    expect(competitiveOutcome(huge, 1).eachTenths).toBe(economicUnits(huge).capacityTenths);
  });

  it('gives a cooperative share three countries can really produce', () => {
    for (const name of Object.keys(PRESETS) as Array<keyof typeof PRESETS>) {
      const settings = PRESETS[name];
      const coop = cooperativeMax(settings, 1);
      const { capacityTenths } = economicUnits(settings);
      expect(coop.shareTenths).toBeLessThanOrEqual(capacityTenths);
      expect(coop.equalShares.eachTenths).toBe(coop.shareTenths);
      // Three equal shares are within a tenth of the best total, each way.
      expect(Math.abs(coop.equalShares.totalTenths - coop.totalTenths)).toBeLessThanOrEqual(2);
    }
  });

  it('never makes the competitive outcome more profitable than cooperating', () => {
    for (const year of [1, 9]) {
      const coop = cooperativeMax(standard, year);
      const nash = competitiveOutcome(standard, year);
      expect(nash.jointProfitK).toBeLessThan(coop.jointMaxK);
      expect(nash.totalTenths).toBeGreaterThan(coop.totalTenths + coop.newProducerTenths);
    }
  });
});
