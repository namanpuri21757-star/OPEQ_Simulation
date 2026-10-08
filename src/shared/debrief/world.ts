/**
 * One world's story, year by year (SPEC 8.4 Debrief).
 *
 * Everything here reads the settled years that are already in the session: no
 * year is re-scored, so a debrief number can never disagree with the number the
 * class saw at the reveal. The one thing that is worked out fresh is each year's
 * cooperative maximum, which is a benchmark and was never shown during play.
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES, type CountryLetter } from '../constants.js';
import { cooperativeMax } from '../engine/engine.js';
import { roundDiv } from '../engine/integers.js';
import { yearLabel } from '../labels.js';
import type { Settings } from '../settings.js';
import type { SessionState, WorldState, WorldYearRecord } from '../state.js';
import { formatQuantity } from '../units.js';
import {
  COOPERATION_RUN,
  COOPERATION_SLACK_PCT,
  type DebriefBreak,
  type DebriefCountryYear,
  type DebriefMarker,
  type DebriefMessage,
  type DebriefYear,
} from './types.js';

/** value as a whole percent of base, and 0 when there is no base to divide by. */
export function percentOf(value: number, base: number): number {
  if (base === 0) return 0;
  return roundDiv(value * 100, base);
}

/**
 * Whether one country's output counts as cooperating.
 *
 * The comparison is exact rather than using the rounded percent beside it: a
 * country at 42.1 against a share of 38.3 is 9.9% above and a country at 42.2 is
 * 10.2%, and both would round to 10. The displayed percent is for reading; this
 * is for deciding.
 */
export function withinSlack(actualTenths: number, shareTenths: number): boolean {
  return actualTenths * 100 <= shareTenths * (100 + COOPERATION_SLACK_PCT);
}

/**
 * Turns a world's scored years into debrief rows.
 *
 * Cumulative figures run over scored years only. The practice year is left out
 * everywhere in the debrief, the same way it is left out of every score
 * (SPEC section 3).
 */
export function yearsFor(state: SessionState, world: WorldState): DebriefYear[] {
  const settings = state.settings;
  const cumulativeOwn: Record<CountryLetter, number> = { A: 0, B: 0, C: 0 };
  let cumulativeJoint = 0;
  let cumulativeMax = 0;

  return world.years.map((record) => {
    const benchmark = cooperativeMax(settings, record.year);

    const countries: DebriefCountryYear[] = COUNTRY_LETTERS.map((letter) => {
      const outcome = record.outcome.countries[letter];
      cumulativeOwn[letter] += outcome.profitK;
      return {
        letter,
        countryName: COUNTRY_NAMES[letter],
        targetTenths: record.decisions[letter].tenths,
        actualTenths: outcome.actualTenths,
        auto: outcome.auto,
        profitK: outcome.profitK,
        cumulativeProfitK: cumulativeOwn[letter],
        shareTenths: benchmark.shareTenths,
        aboveSharePct: percentOf(
          outcome.actualTenths - benchmark.shareTenths,
          benchmark.shareTenths,
        ),
      };
    });

    const cooperative = COUNTRY_LETTERS.every((letter) =>
      withinSlack(record.outcome.countries[letter].actualTenths, benchmark.shareTenths),
    );
    const jointProfitK = countries.reduce((sum, country) => sum + country.profitK, 0);
    cumulativeJoint += jointProfitK;
    cumulativeMax += benchmark.jointMaxK;

    return {
      year: record.year,
      label: yearLabel(record.year),
      priceCents: record.outcome.priceCents,
      totalTenths: record.outcome.totalTenths,
      newProducerTenths: record.outcome.newProducerTenths,
      jointProfitK,
      cumulativeJointProfitK: cumulativeJoint,
      cooperativeMaxK: benchmark.jointMaxK,
      cumulativeCooperativeMaxK: cumulativeMax,
      percentOfMax: percentOf(jointProfitK, benchmark.jointMaxK),
      cumulativePercentOfMax: percentOf(cumulativeJoint, cumulativeMax),
      cooperative,
      countries,
    };
  });
}

/**
 * The year cooperation broke.
 *
 * The rule (logged in docs/DECISIONS.md): a year is cooperative when every
 * country produced no more than COOPERATION_SLACK_PCT above an equal share of
 * that year's best joint total. The break is the first year that is not
 * cooperative and that follows a run of at least COOPERATION_RUN cooperative
 * years. A world that never settled into a run of two has nothing to break, and
 * the note says so rather than naming a year that would mislead.
 */
export function breakFor(years: readonly DebriefYear[]): DebriefBreak {
  let run = 0;
  let longestRun = 0;
  for (const year of years) {
    if (year.cooperative) {
      run += 1;
      longestRun = Math.max(longestRun, run);
      continue;
    }
    if (run >= COOPERATION_RUN) {
      const letters = year.countries
        .filter((country) => !withinSlack(country.actualTenths, country.shareTenths))
        .map((country) => country.letter);
      const names = letters.map((letter) => COUNTRY_NAMES[letter]).join(' and ');
      return {
        year: year.year,
        longestRun,
        letters,
        note: `After ${String(run)} years of holding together, ${names} produced more than an equal share in ${year.label}.`,
      };
    }
    run = 0;
  }

  if (years.length === 0) {
    return { year: null, longestRun: 0, letters: [], note: 'No years were scored.' };
  }
  if (longestRun >= COOPERATION_RUN) {
    return {
      year: null,
      longestRun,
      letters: [],
      note: 'This world never broke its agreement: every country stayed close to an equal share.',
    };
  }
  return {
    year: null,
    longestRun,
    letters: [],
    note:
      longestRun > 0
        ? 'Cooperation never lasted two years in a row, so there was no agreement to break.'
        : 'This world never produced close to an equal share, so there was no agreement to break.',
  };
}

/**
 * The moments worth labelling on the chart (SPEC 8.4).
 *
 * An activity happens after a year, so its marker sits on that year. The new
 * producer bites from the start of its year, so it sits on that one. Bringing it
 * in early moved the year in the settings, so reading the settings is enough.
 */
export function markersFor(state: SessionState, world: WorldState): DebriefMarker[] {
  const settings: Settings = state.settings;
  const played = new Set(world.years.map((record) => record.year));
  const markers: DebriefMarker[] = [];

  for (const key of state.activitiesDone) {
    const [rawYear, kind] = key.split(':');
    const year = Number(rawYear);
    if (!Number.isInteger(year) || year < 1) continue;
    if (kind !== 'chat' && kind !== 'summit') continue;
    markers.push({
      kind,
      year,
      label:
        kind === 'chat'
          ? `Messaging on after ${yearLabel(year)}`
          : `Summit after ${yearLabel(year)}`,
    });
  }

  const np = settings.newProducer;
  if (np.enabled && played.has(np.year)) {
    const barrels = world.years.find((record) => record.year === np.year)?.outcome
      .newProducerTenths;
    markers.push({
      kind: 'newProducer',
      year: np.year,
      label: `New producer arrives${barrels === undefined ? '' : ` (${formatQuantity(barrels)} million barrels)`}`,
    });
  }

  if (state.finalYearAnnounced && played.has(settings.years)) {
    markers.push({ kind: 'finalYear', year: settings.years, label: 'Final year announced' });
  }

  return markers.sort((x, y) => x.year - y.year);
}

/** The scored year a message came before, or null when no year followed it. */
function yearAfter(records: readonly WorldYearRecord[], at: number): WorldYearRecord | null {
  return records.find((record) => record.closedAt >= at) ?? null;
}

/**
 * This world's message timeline.
 *
 * Each message is tagged with the next scored year to close after it, so the
 * teacher can read what was said and then what each country actually did. A
 * message sent after the last year has no year to pair with.
 */
export function messagesFor(state: SessionState, world: WorldState): DebriefMessage[] {
  return state.messages
    .filter((message) => message.worldId === world.worldId)
    .map((message): DebriefMessage => {
      const record = yearAfter(world.years, message.at);
      return {
        messageId: message.messageId,
        letter: message.letter,
        countryName: COUNTRY_NAMES[message.letter],
        text: message.text,
        at: message.at,
        year: record?.year ?? null,
      };
    });
}
