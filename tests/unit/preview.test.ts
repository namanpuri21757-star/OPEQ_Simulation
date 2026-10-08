import { describe, expect, it } from 'vitest';
import { settingsPreview } from '../../src/shared/preview.js';
import {
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
} from '../../src/shared/engine/engine.js';
import { PRESETS, parseSettings } from '../../src/shared/settings.js';

/**
 * The preview is the only place a teacher is given numbers before anyone plays,
 * so it is pinned to the vectors in SPEC section 3 rather than to itself.
 */
describe('settingsPreview', () => {
  const standard = PRESETS['standard-75'];

  it('matches V6 for the cooperative row', () => {
    const { cooperative } = settingsPreview(standard);
    expect(cooperative.eachTenths).toEqual([383, 383, 383]);
    expect(cooperative.totalTenths).toBe(1149);
    expect(cooperative.priceCents).toBe(3553);
    expect(cooperative.profitK).toEqual([1_322_499, 1_322_499, 1_322_499]);
    expect(cooperative.jointProfitK).toBe(3_967_497);
  });

  it('matches V2 for the competitive row', () => {
    const { competitive } = settingsPreview(standard);
    expect(competitive.eachTenths).toEqual([575, 575, 575]);
    expect(competitive.priceCents).toBe(1825);
    expect(competitive.profitK).toEqual([991_875, 991_875, 991_875]);
  });

  it('matches V3 and BR1 for the cheating row', () => {
    const { cheating } = settingsPreview(standard);
    // BR1: the best response to 76.6 asks for 76.7 and is capped at capacity.
    expect(cheating.eachTenths).toEqual([750, 383, 383]);
    expect(cheating.priceCents).toBe(2452);
    expect(cheating.profitK[0]).toBe(1_764_000);
    expect(cheating.profitK[1]).toBe(900_816);
  });

  it('works out the gain and the loss from those two rows', () => {
    const preview = settingsPreview(standard);
    expect(preview.cheatingGainK).toBe(1_764_000 - 1_322_499);
    expect(preview.keeperLossK).toBe(1_322_499 - 900_816);
  });

  it('is the same every time, even with production variance on', () => {
    const settings = parseSettings({ variancePct: 20 });
    const first = settingsPreview(settings);
    const second = settingsPreview(settings);
    expect(first).toEqual(second);
    // Variance is a surprise during a year, not something to plan around, so
    // the preview shows the targets themselves.
    expect(first.cooperative.eachTenths).toEqual([383, 383, 383]);
  });

  it('takes the new producer into account in its year', () => {
    const year = standard.newProducer.year;
    const preview = settingsPreview(standard, year);
    const coop = cooperativeMax(standard, year);

    expect(preview.year).toBe(year);
    expect(preview.cooperative.newProducerTenths).toBe(150);
    expect(preview.cooperative.eachTenths).toEqual([
      coop.shareTenths,
      coop.shareTenths,
      coop.shareTenths,
    ]);
    // The cheater is responding to the other two plus the new producer.
    expect(preview.cheating.eachTenths[0]).toBe(
      bestResponseTenths(coop.shareTenths * 2 + 150, standard),
    );
  });

  it('follows a changed price line, slope and cost', () => {
    const settings = parseSettings({ a: 120, b: 0.8, cost: 5, capacity: 50, startingOutput: 20 });
    const preview = settingsPreview(settings);
    const coop = cooperativeMax(settings, 1);
    const nash = competitiveOutcome(settings, 1);

    expect(preview.cooperative.priceCents).toBe(coop.equalShares.priceCents);
    expect(preview.cooperative.profitK[0]).toBe(coop.equalShares.eachProfitK);
    expect(preview.competitive.eachTenths).toEqual([
      nash.eachTenths,
      nash.eachTenths,
      nash.eachTenths,
    ]);
    expect(preview.competitive.profitK[0]).toBe(nash.eachProfitK);
  });

  it('shows cheating as no gain when capacity already caps everyone', () => {
    // With capacity below an equal cooperative share, every row is at the cap
    // and there is no extra barrel to take.
    const settings = parseSettings({ capacity: 10, startingOutput: 10 });
    const preview = settingsPreview(settings);

    expect(preview.cheating.eachTenths).toEqual([100, 100, 100]);
    expect(preview.cheatingGainK).toBe(0);
    expect(preview.keeperLossK).toBe(0);
  });

  it('never shows a negative price', () => {
    // Cost above the highest price is refused by validateSettings, so the only
    // way to a zero price is a lot of supply; the floor still has to hold.
    const settings = parseSettings({ a: 10, b: 2, cost: 1 });
    const preview = settingsPreview(settings);
    for (const row of [preview.cooperative, preview.competitive, preview.cheating]) {
      expect(row.priceCents).toBeGreaterThanOrEqual(0);
    }
  });
});
