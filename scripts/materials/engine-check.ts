/**
 * Builds docs/materials/engine-check.csv: 200 seeded cases a teacher can check
 * in a spreadsheet with =MAX(0,70-0.3*(A2+B2+C2)).
 *
 * Variance is off and there is no new producer, so every row is reproducible
 * with nothing but the price rule. Row 1 is the header, so the first case is on
 * row 2 and that formula lines up as written.
 */

import { PRESETS, economicUnits } from '../../src/shared/settings.js';
import { priceCents, profitK } from '../../src/shared/engine/engine.js';
import { randomIntInclusive, seededRng } from '../../src/shared/engine/rng.js';
import { priceNumber, profitNumber, quantityNumber } from '../../src/shared/units.js';

export const ENGINE_CHECK_CASES = 200;

export function engineCheckCsv(): string {
  const settings = PRESETS['standard-75'];
  const u = economicUnits(settings);
  const next = seededRng('engine-check', ENGINE_CHECK_CASES);

  const rows = ['QA,QB,QC,Price,ProfitA,ProfitB,ProfitC'];
  for (let i = 0; i < ENGINE_CHECK_CASES; i += 1) {
    const q = [0, 1, 2].map(() => randomIntInclusive(next, 0, u.capacityTenths));
    const total = q.reduce((sum, tenths) => sum + tenths, 0);
    const price = priceCents(total, u.aCents, u.bHundredths);
    rows.push(
      [
        ...q.map(quantityNumber),
        priceNumber(price),
        ...q.map((tenths) => profitNumber(profitK(price, u.costCents, tenths))),
      ].join(','),
    );
  }
  return `${rows.join('\n')}\n`;
}
