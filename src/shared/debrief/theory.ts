/**
 * The game-theory screen's numbers (SPEC 8.4 and learning goal LG4).
 *
 * These are the benchmarks the class never saw during play: the cooperative
 * maximum, the competitive (Nash) outcome and the best response to everyone
 * cooperating. They are worked out for the session's own settings, so the
 * explanation on screen uses the class's own numbers.
 *
 * The benchmarks are taken for Year 1, before any new producer arrives, because
 * that is the year every preset shares and the one the agreement was made in.
 */

import {
  bestResponseRawTenths,
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  effectiveA,
  priceCents,
  profitK,
} from '../engine/engine.js';
import { roundDiv } from '../engine/integers.js';
import { economicUnits, type Settings } from '../settings.js';
import { formatQuantity } from '../units.js';
import type { DebriefLanding, DebriefTheory, DebriefWorld, DebriefWorldLanding } from './types.js';

/** The year the benchmarks are worked out for. */
export const THEORY_YEAR = 1;

/**
 * How close to a benchmark a world has to land to be called that benchmark, as
 * a percent either side. Five percent is about four million barrels on the
 * standard settings, which is inside the rounding a class can act on anyway.
 */
const LANDING_SLACK_PCT = 5;

function landingOf(
  averageTenths: number,
  cooperativeTenths: number,
  competitiveTenths: number,
): DebriefLanding {
  if (averageTenths * 100 <= cooperativeTenths * (100 + LANDING_SLACK_PCT)) return 'cooperative';
  if (averageTenths * 100 >= competitiveTenths * (100 + LANDING_SLACK_PCT)) return 'beyond';
  if (averageTenths * 100 >= competitiveTenths * (100 - LANDING_SLACK_PCT)) return 'competitive';
  return 'between';
}

const LANDING_WORDS: Record<DebriefLanding, string> = {
  cooperative: 'produced about as little as a perfect agreement would',
  between: 'produced more than an agreement but less than full competition',
  competitive: 'produced about as much as full competition would',
  beyond: 'produced even more than full competition would',
};

/**
 * Where each world actually landed.
 *
 * The average counts the three countries only, never the new producer's
 * barrels, so it can be compared with the two benchmarks, which are also about
 * the three countries.
 */
function landingsFor(
  worlds: readonly DebriefWorld[],
  cooperativeTenths: number,
  competitiveTenths: number,
): DebriefWorldLanding[] {
  return worlds.map((world) => {
    const totals = world.years.map((year) =>
      year.countries.reduce((sum, country) => sum + country.actualTenths, 0),
    );
    const average =
      totals.length === 0
        ? 0
        : roundDiv(
            totals.reduce((sum, value) => sum + value, 0),
            totals.length,
          );
    const landing = landingOf(average, cooperativeTenths, competitiveTenths);
    return {
      worldNumber: world.worldNumber,
      label: world.label,
      averageTotalTenths: average,
      percentOfMax: world.percentOfMax,
      landing,
      note:
        totals.length === 0
          ? `${world.label} played no scored years.`
          : `${world.label} averaged ${formatQuantity(average)} million barrels a year and ${LANDING_WORDS[landing]}.`,
    };
  });
}

export function theoryFor(settings: Settings, worlds: readonly DebriefWorld[]): DebriefTheory {
  const year = THEORY_YEAR;
  const units = economicUnits(settings);
  const aCents = effectiveA(year, settings);
  const coop = cooperativeMax(settings, year);
  const nash = competitiveOutcome(settings, year);

  const share = coop.shareTenths;
  const others = share * 2;
  const best = bestResponseTenths(others, settings, year);

  // One country at its best response while the other two keep the agreement.
  const cheatTotal = best + others + coop.newProducerTenths;
  const cheatPrice = priceCents(cheatTotal, aCents, units.bHundredths);
  const cheaterProfitK = profitK(cheatPrice, units.costCents, best);
  const cooperatorProfitK = profitK(cheatPrice, units.costCents, share);

  return {
    year,
    shareTenths: share,
    cooperativeTotalTenths: coop.totalTenths,
    cooperativePriceCents: coop.equalShares.priceCents,
    cooperativeMaxK: coop.jointMaxK,
    cooperativeEachProfitK: coop.equalShares.eachProfitK,
    competitiveEachTenths: nash.eachTenths,
    competitiveTotalTenths: nash.eachTenths * 3,
    competitivePriceCents: nash.priceCents,
    competitiveEachProfitK: nash.eachProfitK,
    bestResponseOthersTenths: others,
    bestResponseTenths: best,
    bestResponseRawTenths: bestResponseRawTenths(others, settings, year),
    bestResponseProfitK: cheaterProfitK,
    gainFromCheatingK: cheaterProfitK - coop.equalShares.eachProfitK,
    lossPerCooperatorK: coop.equalShares.eachProfitK - cooperatorProfitK,
    landings: landingsFor(worlds, coop.totalTenths, nash.eachTenths * 3),
  };
}
