/**
 * The whole economy of the game, as pure functions (SPEC section 3).
 *
 * Nothing here reads a clock, a socket or Math.random, so the same inputs always
 * give the same outputs and a reveal can be replayed from the event log.
 *
 * Money and quantities stay in whole units throughout: tenths of a million
 * barrels, cents, thousands of dollars. The only exceptions are the two
 * benchmark functions at the bottom, which divide by 2b and 4b; both say why.
 */

import { COUNTRY_LETTERS, type CountryLetter } from '../constants.js';
import { formatPrice, formatQuantity } from '../units.js';
import {
  type DisclosureMode,
  type Settings,
  economicUnits,
  type EconomicUnits,
} from '../settings.js';
import {
  ceilDiv,
  clamp,
  floorDiv,
  roundDiv,
  roundHalfAwayFromZero,
  toCents,
  toTenths,
} from './integers.js';
import { randomIntInclusive, seededRng } from './rng.js';

/** The practice year is year 0 everywhere in this project. */
export const PRACTICE_YEAR = 0;

/**
 * The world price in whole cents.
 *
 * SPEC: priceCents = max(0, round(100a - 10b * totalTenths)). 100a is already
 * aCents and 10 * b * tenths is bHundredths * tenths / 10, so the only rounding
 * is that one division.
 */
export function priceCents(totalTenths: number, aCents: number, bHundredths: number): number {
  const fall = roundDiv(bHundredths * totalTenths, 10);
  return Math.max(0, aCents - fall);
}

/**
 * Profit in whole thousands of dollars.
 *
 * 1 cent per barrel on 0.1 million barrels is exactly 1,000 dollars, so the
 * product of two whole units is already the answer: no rounding at all.
 */
export function profitK(price: number, costCents: number, tenths: number): number {
  return (price - costCents) * tenths;
}

/**
 * What a country actually produced once production variance is on.
 *
 * SPEC: actual = target * (1 + u) with u uniform in [-v, +v], rounded to 0.1 and
 * clamped to [0, capacity]. The draw is a whole number of basis points so no
 * float enters, and the result is then held inside the exact +/-v band: rounding
 * to a tenth could otherwise push a small target past its own limit (1.0 million
 * with 5% variance would round to 1.1, which is 10% off).
 */
export function applyVariance(
  targetTenths: number,
  variancePct: number,
  seedParts: Array<string | number>,
  capacityTenths: number,
): number {
  const inRange = clamp(targetTenths, 0, capacityTenths);
  if (variancePct <= 0 || inRange === 0) return inRange;

  const bp = variancePct * 100; // 5% is 500 basis points of 10,000.
  const draw = randomIntInclusive(seededRng(...seedParts), -bp, bp);
  const shifted = roundDiv(inRange * (10000 + draw), 10000);

  const lowest = ceilDiv(inRange * (10000 - bp), 10000);
  const highest = floorDiv(inRange * (10000 + bp), 10000);
  return clamp(clamp(shifted, lowest, highest), 0, capacityTenths);
}

/** The highest price (a) for a year in cents, after any demand event. */
export function effectiveA(year: number, settings: Settings): number {
  const { aCents } = economicUnits(settings);
  const event = settings.demandEvent;
  if (!event.enabled || year < 1 || year < event.year) return aCents;
  return aCents + toCents(event.deltaA);
}

/** The new producer's output in tenths: 0 until the year it enters. */
export function newProducerTenths(year: number, settings: Settings): number {
  const np = settings.newProducer;
  if (!np.enabled || year < 1 || year < np.year) return 0;
  return toTenths(np.output);
}

/** What one country asked for this year. */
export interface CountryTarget {
  tenths: number;
  /** True when the server filled this in because the team did not submit. */
  auto: boolean;
}

export interface ResolveWorldYearInput {
  settings: Settings;
  sessionSeed: string;
  worldId: string;
  year: number;
  isPractice: boolean;
  targets: Record<CountryLetter, CountryTarget>;
}

export interface CountryOutcome {
  letter: CountryLetter;
  targetTenths: number;
  actualTenths: number;
  auto: boolean;
  profitK: number;
}

/** Everything the reveal, the exports and the explanation need. */
export interface WorldYearOutcome {
  year: number;
  isPractice: boolean;
  countries: Record<CountryLetter, CountryOutcome>;
  newProducerTenths: number;
  totalTenths: number;
  priceCents: number;
  inputs: ExplainInputs & {
    bHundredths: number;
    costCents: number;
    capacityTenths: number;
    variancePct: number;
  };
}

/** The parts of a year that the plain-sentence explanation is allowed to use. */
export interface ExplainInputs {
  aCents: number;
  demandEventApplied: boolean;
  demandEventAnnounced: boolean;
  newProducerAnnounced: boolean;
}

/**
 * Settles one world for one year.
 *
 * The practice year counts as year 0, so neither the new producer nor a demand
 * event can appear in it: both are scheduled for a numbered year.
 */
export function resolveWorldYear(input: ResolveWorldYearInput): WorldYearOutcome {
  const { settings, sessionSeed, worldId, isPractice } = input;
  const year = isPractice ? PRACTICE_YEAR : input.year;
  const units: EconomicUnits = economicUnits(settings);

  const aCents = effectiveA(year, settings);
  const qn = newProducerTenths(year, settings);

  const actual = {} as Record<CountryLetter, number>;
  for (const letter of COUNTRY_LETTERS) {
    const target = input.targets[letter];
    actual[letter] = applyVariance(
      target.tenths,
      settings.variancePct,
      [sessionSeed, worldId, year, letter],
      units.capacityTenths,
    );
  }

  const totalTenths = COUNTRY_LETTERS.reduce((sum, letter) => sum + actual[letter], 0) + qn;
  const price = priceCents(totalTenths, aCents, units.bHundredths);

  const countries = {} as Record<CountryLetter, CountryOutcome>;
  for (const letter of COUNTRY_LETTERS) {
    const target = input.targets[letter];
    countries[letter] = {
      letter,
      targetTenths: target.tenths,
      actualTenths: actual[letter],
      auto: target.auto,
      profitK: profitK(price, units.costCents, actual[letter]),
    };
  }

  const event = settings.demandEvent;
  return {
    year,
    isPractice,
    countries,
    newProducerTenths: qn,
    totalTenths,
    priceCents: price,
    inputs: {
      aCents,
      bHundredths: units.bHundredths,
      costCents: units.costCents,
      capacityTenths: units.capacityTenths,
      variancePct: settings.variancePct,
      demandEventApplied: event.enabled && year >= 1 && year >= event.year,
      demandEventAnnounced: event.announced,
      newProducerAnnounced: settings.newProducer.announced,
    },
  };
}

// ---------------------------------------------------------------------------
// Benchmarks for the teacher's answer key and the debrief. Never shown to
// students during play (SPEC section 3).
//
// These three divide by 2b or 4b. No integer unit makes that division exact (b
// is a price per unit of quantity, so 1/b is not a whole number of anything), so
// they work in plain dollars and millions and then round the answer to the
// nearest tenth of a million, which is the finest decision a team can make. From
// there the price and the profit are computed by the integer functions above, so
// the printed benchmark is a number a team could actually reach.
// ---------------------------------------------------------------------------

interface Dollars {
  a: number;
  b: number;
  c: number;
  capacityTenths: number;
}

function dollars(settings: Settings, year: number): Dollars {
  const units = economicUnits(settings);
  return {
    a: effectiveA(year, settings) / 100,
    b: units.bHundredths / 100,
    c: units.costCents / 100,
    capacityTenths: units.capacityTenths,
  };
}

/**
 * The best output against a known total from everyone else, before capacity is
 * applied: q* = (a - c - b * others) / (2b), rounded to a tenth.
 *
 * othersTenths is all other supply in the world, so it has to include the new
 * producer in the years it is there.
 */
export function bestResponseRawTenths(
  othersTenths: number,
  settings: Settings,
  year: number,
): number {
  const { a, b, c } = dollars(settings, year);
  const q = (a - c - b * (othersTenths / 10)) / (2 * b);
  return roundHalfAwayFromZero(q * 10);
}

/** The best response a country can actually produce: clamped to [0, capacity]. */
export function bestResponseTenths(othersTenths: number, settings: Settings, year: number): number {
  const { capacityTenths } = dollars(settings, year);
  return clamp(bestResponseRawTenths(othersTenths, settings, year), 0, capacityTenths);
}

export interface SymmetricOutcome {
  /** What each of the three countries produces. */
  eachTenths: number;
  newProducerTenths: number;
  totalTenths: number;
  priceCents: number;
  /** Profit for one country, in thousands of dollars. */
  eachProfitK: number;
  /** All three countries added up. */
  jointProfitK: number;
}

/**
 * The competitive (Nash) outcome: every country playing its best response to the
 * other two at once gives q = (a - c - b * Qn) / (4b).
 */
export function competitiveOutcome(settings: Settings, year: number): SymmetricOutcome {
  const { a, b, c, capacityTenths } = dollars(settings, year);
  const qn = newProducerTenths(year, settings);
  const q = (a - c - b * (qn / 10)) / (4 * b);
  const eachTenths = clamp(roundHalfAwayFromZero(q * 10), 0, capacityTenths);
  return symmetric(eachTenths, qn, settings, year);
}

export interface CooperativeOutcome {
  /** The best total for the three countries together. */
  totalTenths: number;
  /** An equal share of that total, rounded to a tenth. */
  shareTenths: number;
  newProducerTenths: number;
  priceCents: number;
  /** The three countries' profit added up, at the best total. */
  jointMaxK: number;
  /** What three equal shares actually add up to, and what that pays. */
  equalShares: SymmetricOutcome;
}

/**
 * The most the three countries can make in one year together (SPEC section 3):
 * Q* = clamp((a - c - b * Qn) / (2b), 0, 3 * capacity), then
 * jointMax = (max(0, a - b * (Q* + Qn)) - c) * Q*.
 */
export function cooperativeMax(settings: Settings, year: number): CooperativeOutcome {
  const { a, b, c, capacityTenths } = dollars(settings, year);
  const units = economicUnits(settings);
  const qn = newProducerTenths(year, settings);
  const q = (a - c - b * (qn / 10)) / (2 * b);
  const totalTenths = clamp(roundHalfAwayFromZero(q * 10), 0, 3 * capacityTenths);

  const price = priceCents(totalTenths + qn, effectiveA(year, settings), units.bHundredths);
  const shareTenths = clamp(roundHalfAwayFromZero(totalTenths / 3), 0, capacityTenths);

  return {
    totalTenths,
    shareTenths,
    newProducerTenths: qn,
    priceCents: price,
    jointMaxK: profitK(price, units.costCents, totalTenths),
    equalShares: symmetric(shareTenths, qn, settings, year),
  };
}

/** Price and profit when all three countries produce the same amount. */
function symmetric(
  eachTenths: number,
  qn: number,
  settings: Settings,
  year: number,
): SymmetricOutcome {
  const units = economicUnits(settings);
  const totalTenths = eachTenths * 3 + qn;
  const price = priceCents(totalTenths, effectiveA(year, settings), units.bHundredths);
  const each = profitK(price, units.costCents, eachTenths);
  return {
    eachTenths,
    newProducerTenths: qn,
    totalTenths,
    priceCents: price,
    eachProfitK: each,
    jointProfitK: each * 3,
  };
}

// ---------------------------------------------------------------------------
// The one-sentence explanation shown at a reveal.
// ---------------------------------------------------------------------------

/** What one year looked like, as far as the explanation is concerned. */
export interface PriceSnapshot {
  priceCents: number;
  /** All supply in the world, the new producer included. */
  totalTenths: number;
  newProducerTenths: number;
  demandEventApplied: boolean;
  demandEventAnnounced: boolean;
  newProducerAnnounced: boolean;
}

/** Pulls the snapshot the explanation needs out of a settled year. */
export function snapshotOf(outcome: WorldYearOutcome): PriceSnapshot {
  return {
    priceCents: outcome.priceCents,
    totalTenths: outcome.totalTenths,
    newProducerTenths: outcome.newProducerTenths,
    demandEventApplied: outcome.inputs.demandEventApplied,
    demandEventAnnounced: outcome.inputs.demandEventAnnounced,
    newProducerAnnounced: outcome.inputs.newProducerAnnounced,
  };
}

/**
 * One plain sentence about why the price moved.
 *
 * It only ever uses what the recipient is allowed to know: under priceOnly the
 * world total is private, so no reason is given at all; a demand event is named
 * only when it was announced; the new producer is named only when it was
 * announced. Under full and totalOnly the world total is public either way, so
 * quoting the change in supply gives nothing away.
 */
export function explainChange(
  previous: PriceSnapshot | null,
  current: PriceSnapshot,
  disclosure: DisclosureMode,
): string {
  const price = formatPrice(current.priceCents);
  if (previous === null) return `Price is ${price}.`;

  const priceDelta = current.priceCents - previous.priceCents;
  if (priceDelta === 0) return `Price did not change and is still ${price}.`;

  const direction = priceDelta > 0 ? 'rose' : 'fell';
  const movement = `Price ${direction} ${formatPrice(Math.abs(priceDelta))}`;
  const reasons = disclosure === 'priceOnly' ? [] : reasonsFor(previous, current);
  return reasons.length === 0 ? `${movement}.` : `${movement} because ${joinPlainly(reasons)}.`;
}

/** "a", "a and b", "a, b and c" - the way a list is read out loud. */
function joinPlainly(parts: string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function reasonsFor(previous: PriceSnapshot, current: PriceSnapshot): string[] {
  const reasons: string[] = [];

  const supplyDelta = current.totalTenths - previous.totalTenths;
  if (supplyDelta !== 0) {
    const direction = supplyDelta > 0 ? 'rose' : 'fell';
    reasons.push(
      `world supply ${direction} ${formatQuantity(Math.abs(supplyDelta))} million barrels`,
    );
  }

  if (current.demandEventApplied && !previous.demandEventApplied && current.demandEventAnnounced) {
    reasons.push('the news changed how much the world wants to buy');
  }

  if (current.newProducerAnnounced && current.newProducerTenths > previous.newProducerTenths) {
    reasons.push('another producer joined the market');
  }

  return reasons;
}
