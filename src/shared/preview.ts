/**
 * The three numbers a teacher needs before a lesson starts: what happens if
 * everyone cooperates, what happens if everyone competes, and what one country
 * gains by breaking a deal (SPEC 8.4, "a live preview of cooperative and
 * competitive outcomes for the chosen settings").
 *
 * It lives here rather than on the setup screen because the same numbers appear
 * in the preview panel, in a component test and in the debrief, and three copies
 * of "what would cheating pay" would drift apart. Everything comes from the
 * engine, so the preview can never disagree with what a world actually scores.
 */

import { COUNTRY_LETTERS, type CountryLetter } from './constants.js';
import {
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  newProducerTenths,
  resolveWorldYear,
} from './engine/engine.js';
import type { Settings } from './settings.js';

/** One row of the preview: three outputs, the price they make, and the profits. */
export interface PreviewRow {
  /** What each country produces, in tenths of a million barrels. */
  eachTenths: number[];
  newProducerTenths: number;
  totalTenths: number;
  priceCents: number;
  /** Profit per country, in thousands of dollars, in the same order. */
  profitK: number[];
  /** The three countries added up. */
  jointProfitK: number;
}

export interface SettingsPreview {
  year: number;
  /** All three countries take an equal share of the best joint total. */
  cooperative: PreviewRow;
  /** All three play their best response at once (the competitive outcome). */
  competitive: PreviewRow;
  /**
   * One country breaks the deal: Ardonia plays its best response while the
   * other two keep to the cooperative share.
   */
  cheating: PreviewRow;
  /** How much the cheater gains over keeping the deal, in thousands. */
  cheatingGainK: number;
  /** How much each country that kept the deal loses by it. */
  keeperLossK: number;
}

/**
 * The preview is worked out with a fixed seed because production variance must
 * not make a setup screen flicker. Variance is a surprise during a year, not a
 * number a teacher is asked to plan around.
 */
const PREVIEW_SEED = 'crude-accord-preview';

function rowFor(settings: Settings, year: number, tenths: readonly number[]): PreviewRow {
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;
  COUNTRY_LETTERS.forEach((letter, index) => {
    targets[letter] = { tenths: tenths[index] ?? 0, auto: false };
  });

  // Variance off: a preview has to be the same number every time it is drawn.
  const outcome = resolveWorldYear({
    settings: { ...settings, variancePct: 0 },
    sessionSeed: PREVIEW_SEED,
    worldId: 'preview',
    year,
    isPractice: false,
    targets,
  });

  const profitK = COUNTRY_LETTERS.map((letter) => outcome.countries[letter].profitK);
  return {
    eachTenths: COUNTRY_LETTERS.map((letter) => outcome.countries[letter].actualTenths),
    newProducerTenths: outcome.newProducerTenths,
    totalTenths: outcome.totalTenths,
    priceCents: outcome.priceCents,
    profitK,
    jointProfitK: profitK.reduce((sum, value) => sum + value, 0),
  };
}

/**
 * Builds the preview for one year of a settings object.
 *
 * Year 1 by default, which is before any scheduled event, so the panel shows the
 * game as a class meets it. Pass the new producer's year to see what that does.
 */
export function settingsPreview(settings: Settings, year = 1): SettingsPreview {
  const coop = cooperativeMax(settings, year);
  const nash = competitiveOutcome(settings, year);
  const share = coop.shareTenths;

  // What one country's best answer is while the other two keep the deal. The
  // other two plus the new producer are the supply it is responding to.
  const qn = newProducerTenths(year, settings);
  const cheat = bestResponseTenths(share * 2 + qn, settings);

  const cooperative = rowFor(settings, year, [share, share, share]);
  const cheating = rowFor(settings, year, [cheat, share, share]);

  return {
    year,
    cooperative,
    competitive: rowFor(settings, year, [nash.eachTenths, nash.eachTenths, nash.eachTenths]),
    cheating,
    cheatingGainK: (cheating.profitK[0] ?? 0) - (cooperative.profitK[0] ?? 0),
    keeperLossK: (cooperative.profitK[1] ?? 0) - (cheating.profitK[1] ?? 0),
  };
}
