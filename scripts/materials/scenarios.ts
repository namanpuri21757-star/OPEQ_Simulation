/**
 * The scenarios the teacher materials are built from.
 *
 * Everything here goes through resolveWorldYear, the same function the server
 * uses in class, so a printed answer key cannot drift away from what a world
 * actually scores.
 */

import type { CountryLetter } from '../../src/shared/constants.js';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { Settings } from '../../src/shared/settings.js';
import { economicUnits } from '../../src/shared/settings.js';
import type { WorldYearOutcome } from '../../src/shared/engine/engine.js';
import {
  competitiveOutcome,
  cooperativeMax,
  newProducerTenths,
  resolveWorldYear,
} from '../../src/shared/engine/engine.js';

/** A fixed seed: the materials must be byte-for-byte the same on every machine. */
export const MATERIALS_SEED = 'crude-accord-materials';

export type Triple = [number, number, number];

/** Settles one made-up year. Presets have variance off, so nothing is random. */
export function outcomeFor(settings: Settings, year: number, tenths: Triple): WorldYearOutcome {
  const targets = {} as Record<CountryLetter, { tenths: number; auto: boolean }>;
  COUNTRY_LETTERS.forEach((letter, index) => {
    targets[letter] = { tenths: tenths[index] ?? 0, auto: false };
  });
  return resolveWorldYear({
    settings,
    sessionSeed: MATERIALS_SEED,
    worldId: 'answer-key',
    year,
    isPractice: false,
    targets,
  });
}

export interface NamedScenario {
  name: string;
  note: string;
  tenths: Triple;
  outcome: WorldYearOutcome;
}

/** The four rows SPEC-driven answer keys need, for one year of one preset. */
export function scenariosForYear(settings: Settings, year: number): NamedScenario[] {
  const { capacityTenths } = economicUnits(settings);
  const share = cooperativeMax(settings, year).shareTenths;
  const nash = competitiveOutcome(settings, year).eachTenths;

  const rows: Array<[string, string, Triple]> = [
    [
      'Everyone cooperates',
      'Each country takes an equal share of the best joint total.',
      [share, share, share],
    ],
    [
      'Everyone competes',
      'Each country plays its best response to the other two.',
      [nash, nash, nash],
    ],
    [
      'One country cheats',
      'Ardonia goes to full capacity while the other two keep cooperating.',
      [capacityTenths, share, share],
    ],
    [
      'Everyone at capacity',
      'All three pump as hard as they can.',
      [capacityTenths, capacityTenths, capacityTenths],
    ],
  ];

  return rows.map(([name, note, tenths]) => ({
    name,
    note,
    tenths,
    outcome: outcomeFor(settings, year, tenths),
  }));
}

/** The year a new producer arrives, or null when the preset has none. */
export function newProducerYear(settings: Settings): number | null {
  const np = settings.newProducer;
  if (!np.enabled || np.year > settings.years) return null;
  return newProducerTenths(np.year, settings) > 0 ? np.year : null;
}
