/**
 * The test vectors SPEC section 3 lists, compared as exact integers.
 *
 * These are the numbers the spec promises, so they are asserted on whole cents
 * and whole thousands of dollars with toBe, never on a rounded display string.
 */

import { describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS, type CountryLetter } from '@shared/constants.js';
import { PRESETS, economicUnits, parseSettings, type Settings } from '@shared/settings.js';
import {
  bestResponseRawTenths,
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  priceCents,
  profitK,
  resolveWorldYear,
} from '@shared/engine/engine.js';

const standard = PRESETS['standard-75'];

/** Settles a year with no variance, so the vector is the only thing under test. */
function settle(tenths: [number, number, number], settings: Settings = standard, year = 1) {
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;
  COUNTRY_LETTERS.forEach((letter, index) => {
    targets[letter] = { tenths: tenths[index] ?? 0, auto: false };
  });
  return resolveWorldYear({
    settings,
    sessionSeed: 'vectors',
    worldId: 'W1',
    year,
    isPractice: false,
    targets,
  });
}

/** The same three countries, plus a new producer of the given size. */
function withNewProducer(outputMillions: number, year = 1): Settings {
  return parseSettings({ newProducer: { enabled: true, year, output: outputMillions } });
}

describe('SPEC section 3 test vectors', () => {
  it('V1: all three at 40 give $34.00 and $1,320.00M each', () => {
    const o = settle([400, 400, 400]);
    expect(o.priceCents).toBe(3400);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(1_320_000);
  });

  it('V2: all three at 57.5 give $18.25 and 991875 K each', () => {
    const o = settle([575, 575, 575]);
    expect(o.priceCents).toBe(1825);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(991_875);
  });

  it('V3: 75 / 38.3 / 38.3 give $24.52, 1764000 K and 900816 K', () => {
    const o = settle([750, 383, 383]);
    expect(o.priceCents).toBe(2452);
    expect(o.countries.A.profitK).toBe(1_764_000);
    expect(o.countries.B.profitK).toBe(900_816);
    expect(o.countries.C.profitK).toBe(900_816);
  });

  it('V4: all three at 75 give $2.50 and $112.50M each', () => {
    const o = settle([750, 750, 750]);
    expect(o.priceCents).toBe(250);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(112_500);
  });

  it('V5: all three at 0 give $70.00 and no profit', () => {
    const o = settle([0, 0, 0]);
    expect(o.priceCents).toBe(7000);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(0);
  });

  it('V6: all three at 38.3 give $35.53 and 1322499 K each', () => {
    const o = settle([383, 383, 383]);
    expect(o.priceCents).toBe(3553);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(1_322_499);
  });

  it('V7: a new producer of 15 with all three at 38.3 gives $31.03 and 1150149 K each', () => {
    const o = settle([383, 383, 383], withNewProducer(15));
    expect(o.newProducerTenths).toBe(150);
    expect(o.totalTenths).toBe(1299);
    expect(o.priceCents).toBe(3103);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(1_150_149);
  });

  it('V8: a new producer of 100 with all three at 75 floors the price at $0.00 and loses $75.00M each', () => {
    const o = settle([750, 750, 750], withNewProducer(100));
    expect(o.totalTenths).toBe(3250);
    expect(o.priceCents).toBe(0);
    for (const letter of COUNTRY_LETTERS) expect(o.countries[letter].profitK).toBe(-75_000);
  });

  it('BR1: against 76.6 the formula asks for 76.7 and capacity caps it at 75', () => {
    expect(bestResponseRawTenths(766, standard, 1)).toBe(767);
    expect(bestResponseTenths(766, standard, 1)).toBe(750);
  });

  it('BR2: against 115 the best response is 57.5', () => {
    expect(bestResponseRawTenths(1150, standard, 1)).toBe(575);
    expect(bestResponseTenths(1150, standard, 1)).toBe(575);
  });

  it('CM1: the cooperative maximum is a total of 115 worth $3,967.50M', () => {
    const coop = cooperativeMax(standard, 1);
    expect(coop.newProducerTenths).toBe(0);
    expect(coop.totalTenths).toBe(1150);
    expect(coop.jointMaxK).toBe(3_967_500);
  });
});

describe('benchmarks line up with the vectors', () => {
  it('the competitive outcome is V2', () => {
    const nash = competitiveOutcome(standard, 1);
    expect(nash.eachTenths).toBe(575);
    expect(nash.totalTenths).toBe(1725);
    expect(nash.priceCents).toBe(1825);
    expect(nash.eachProfitK).toBe(991_875);
    expect(nash.jointProfitK).toBe(2_975_625);
  });

  it('an equal cooperative share is V6', () => {
    const coop = cooperativeMax(standard, 1);
    expect(coop.shareTenths).toBe(383);
    expect(coop.equalShares.priceCents).toBe(3553);
    expect(coop.equalShares.eachProfitK).toBe(1_322_499);
  });

  it('priceCents and profitK can be used on their own', () => {
    const u = economicUnits(standard);
    const price = priceCents(1200, u.aCents, u.bHundredths);
    expect(price).toBe(3400);
    expect(profitK(price, u.costCents, 400)).toBe(1_320_000);
  });
});
