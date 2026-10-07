/**
 * The What-if calculator's arithmetic.
 *
 * It calls the same engine functions the server scores with, so the number a
 * group sees here is the number they would get. It is for display only: nothing
 * computed in this file is ever sent anywhere, and the server never reads it
 * (CLAUDE.md rule 1).
 *
 * The calculator deliberately knows nothing about the new producer. A group is
 * not told when it entered (SPEC section 4), so a calculator that quietly added
 * its barrels would be telling them.
 */

import { priceCents, profitK } from '@shared/engine/engine';
import { toCents, toHundredths, toTenths } from '@shared/engine/integers';
import type { ChartPoint } from '../ui/LineChart';
import type { PublicSettingsView } from '@shared/views';

export interface ClientUnits {
  aCents: number;
  bHundredths: number;
  costCents: number;
  capacityTenths: number;
  startingOutputTenths: number;
}

export function clientUnits(settings: PublicSettingsView): ClientUnits {
  return {
    aCents: toCents(settings.a),
    bHundredths: toHundredths(settings.b),
    costCents: toCents(settings.cost),
    capacityTenths: settings.capacityTenths,
    startingOutputTenths: toTenths(settings.startingOutput),
  };
}

export interface WhatIfResult {
  totalTenths: number;
  priceCents: number;
  profitK: number;
}

/** One guess: my output plus what I think the other two will add up to. */
export function whatIf(
  mineTenths: number,
  othersTenths: number,
  settings: PublicSettingsView,
): WhatIfResult {
  const units = clientUnits(settings);
  const totalTenths = Math.max(0, mineTenths) + Math.max(0, othersTenths);
  const price = priceCents(totalTenths, units.aCents, units.bHundredths);
  return {
    totalTenths,
    priceCents: price,
    profitK: profitK(price, units.costCents, Math.max(0, mineTenths)),
  };
}

/**
 * The demand curve: price against total world production.
 *
 * Eleven points is enough to see a straight line fall and keeps the data table
 * behind the chart short enough to read.
 */
export function demandCurve(settings: PublicSettingsView, steps = 10): ChartPoint[] {
  const units = clientUnits(settings);
  const maxTenths = units.capacityTenths * 3;
  return Array.from({ length: steps + 1 }, (_, index) => {
    const x = Math.round((maxTenths / steps) * index);
    return { x, y: priceCents(x, units.aCents, units.bHundredths) };
  });
}
