/**
 * The two scheduled events, and how the benchmarks move once they land.
 *
 * SPEC section 4: the new producer enters at the start of its year and stays;
 * a demand event changes a from its year onwards. Neither appears in the practice
 * year, which is year 0.
 */

import { describe, expect, it } from 'vitest';
import { PRESETS, economicUnits, parseSettings } from '@shared/settings.js';
import {
  bestResponseRawTenths,
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  effectiveA,
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
    expect(bestResponseTenths(766 + 150, standard, 9)).toBeLessThan(
      bestResponseTenths(766, standard, 8),
    );
  });
});

describe('a demand event', () => {
  const settings = parseSettings({
    demandEvent: { enabled: true, year: 6, deltaA: -10, message: 'Buyers are cutting back.' },
  });

  it('does nothing before its year', () => {
    expect(effectiveA(0, settings)).toBe(7000);
    expect(effectiveA(5, settings)).toBe(7000);
  });

  it('shifts a from its year onwards', () => {
    expect(effectiveA(6, settings)).toBe(6000);
    expect(effectiveA(12, settings)).toBe(6000);
  });

  it('can be positive as well as negative', () => {
    const better = parseSettings({ demandEvent: { enabled: true, year: 2, deltaA: 12.5 } });
    expect(effectiveA(2, better)).toBe(8250);
    const coop = cooperativeMax(better, 2);
    expect(coop.totalTenths).toBeGreaterThan(cooperativeMax(better, 1).totalTenths);
  });

  it('does nothing at all while it is switched off', () => {
    expect(effectiveA(6, standard)).toBe(7000);
  });

  it('lowers the benchmarks when demand falls', () => {
    expect(cooperativeMax(settings, 6).jointMaxK).toBeLessThan(
      cooperativeMax(settings, 5).jointMaxK,
    );
    expect(competitiveOutcome(settings, 6).eachTenths).toBeLessThan(
      competitiveOutcome(settings, 5).eachTenths,
    );
  });
});

describe('the benchmarks at the edges', () => {
  it('asks for 0 when the others have already pushed the price under cost', () => {
    const { capacityTenths } = economicUnits(standard);
    const flooded = capacityTenths * 10;
    expect(bestResponseRawTenths(flooded, standard, 1)).toBeLessThan(0);
    expect(bestResponseTenths(flooded, standard, 1)).toBe(0);
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
