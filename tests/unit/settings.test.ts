/**
 * Instructor settings: the four presets, and every cross-field rule with the
 * message a teacher will actually read on the setup screen.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  PRESET_NAMES,
  activitiesAfterYear,
  economicUnits,
  parseSettings,
  secondsForYear,
  settingsSchema,
  validateSettings,
  type SettingsInput,
} from '@shared/settings.js';

/** The message for one field, or '' when that field was accepted. */
function errorAt(path: string, input: SettingsInput | Record<string, unknown>): string {
  const result = validateSettings(input);
  if (result.ok) return '';
  return result.errors.find((e) => e.path === path)?.message ?? '';
}

describe('presets', () => {
  it('are all valid', () => {
    for (const name of PRESET_NAMES) {
      expect(validateSettings(PRESETS[name]).ok).toBe(true);
    }
  });

  it('standard-75 is the default setup from SPEC section 3', () => {
    const s = PRESETS['standard-75'];
    expect(s).toEqual(DEFAULT_SETTINGS);
    expect([s.a, s.b, s.cost, s.capacity, s.startingOutput]).toEqual([70, 0.3, 1, 75, 40]);
    expect([s.worlds, s.years, s.variancePct]).toEqual([3, 12, 0]);
    expect([s.disclosure, s.chatMode]).toEqual(['full', 'windowsOnly']);
    expect([
      s.timers.practiceSeconds,
      s.timers.earlyYearSeconds,
      s.timers.laterYearSeconds,
    ]).toEqual([120, 150, 120]);
    expect(s.schedule).toEqual([
      { afterYear: 3, kind: 'chat', seconds: 240 },
      { afterYear: 7, kind: 'summit', seconds: 300 },
      { afterYear: 10, kind: 'chat', seconds: 180 },
    ]);
    expect(s.newProducer).toEqual({ enabled: true, year: 9, output: 15, announced: false });
    expect(s.demandEvent.enabled).toBe(false);
    expect([s.finalYearWarning, s.autoClose, s.projectorShowsPrices]).toEqual([true, false, true]);
    expect(s.rotateEvery).toBe(4);
  });

  it('short-50 is 8 years, 90 s years, one chat after Year 3, new producer in Year 6, no summit', () => {
    const s = PRESETS['short-50'];
    expect(s.years).toBe(8);
    expect([
      s.timers.practiceSeconds,
      s.timers.earlyYearSeconds,
      s.timers.laterYearSeconds,
    ]).toEqual([90, 90, 90]);
    expect(s.schedule).toEqual([{ afterYear: 3, kind: 'chat', seconds: 240 }]);
    expect(s.schedule.some((item) => item.kind === 'summit')).toBe(false);
    expect(s.newProducer.year).toBe(6);
    // Everything it does not change stays standard.
    expect(s.capacity).toBe(75);
    expect(s.newProducer.output).toBe(15);
  });

  it('long-90 is 16 years, chats after Years 3 and 12, a summit after Year 7, new producer in Year 11', () => {
    const s = PRESETS['long-90'];
    expect(s.years).toBe(16);
    expect(s.schedule).toEqual([
      { afterYear: 3, kind: 'chat', seconds: 240 },
      { afterYear: 7, kind: 'summit', seconds: 300 },
      { afterYear: 12, kind: 'chat', seconds: 240 },
    ]);
    expect(s.newProducer.year).toBe(11);
  });

  it('test-fast runs every timer at 5 s', () => {
    const s = PRESETS['test-fast'];
    const timers = [
      s.timers.practiceSeconds,
      s.timers.earlyYearSeconds,
      s.timers.laterYearSeconds,
      ...s.schedule.map((item) => item.seconds),
    ];
    expect(new Set(timers)).toEqual(new Set([5]));
    // Otherwise it is the standard game, so a test plays a real one.
    expect(s.years).toBe(PRESETS['standard-75'].years);
  });

  it('every preset keeps its activities inside the years it plays', () => {
    for (const name of PRESET_NAMES) {
      const s = PRESETS[name];
      for (const item of s.schedule) expect(item.afterYear).toBeLessThan(s.years);
      expect(s.newProducer.year).toBeLessThanOrEqual(s.years);
    }
  });
});

describe('defaults', () => {
  it('fills everything in from an empty object', () => {
    expect(validateSettings({})).toEqual({ ok: true, settings: DEFAULT_SETTINGS });
    expect(validateSettings(undefined).ok).toBe(true);
  });

  it('keeps the rest of a group when only one field is given', () => {
    const s = parseSettings({ timers: { practiceSeconds: 30 } });
    expect(s.timers.practiceSeconds).toBe(30);
    expect(s.timers.earlyYearSeconds).toBe(150);
  });

  it('refuses a field it does not know, so a typo is never silently ignored', () => {
    const result = validateSettings({ capcity: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.message).toMatch(/Unrecognized key/);
  });
});

describe('cross-field rules', () => {
  it('needs a above cost', () => {
    expect(errorAt('a', { a: 1, cost: 1 })).toBe(
      'The highest price (a) must be more than the cost per barrel, or no one could ever profit. Right now a is 1 and cost is 1.',
    );
    expect(errorAt('a', { a: 0.5, cost: 2 })).toMatch(/must be more than the cost per barrel/);
    expect(validateSettings({ a: 1.01, cost: 1 }).ok).toBe(true);
  });

  it('needs b above 0', () => {
    expect(errorAt('b', { b: 0 })).toBe(
      'The slope (b) must be more than 0, or the price would never move.',
    );
    expect(errorAt('b', { b: -0.3 })).toMatch(/must be more than 0/);
  });

  it('allows at most 2 decimals on a, b and cost', () => {
    expect(errorAt('a', { a: 70.255 })).toBe(
      'The highest price (a) can have at most 2 decimal places, like 70.25.',
    );
    expect(errorAt('b', { b: 0.333 })).toBe(
      'The slope (b) can have at most 2 decimal places, like 70.25.',
    );
    expect(errorAt('cost', { cost: 1.005 })).toBe(
      'The cost per barrel can have at most 2 decimal places, like 70.25.',
    );
    expect(validateSettings({ a: 70.25, b: 0.25, cost: 1.5 }).ok).toBe(true);
  });

  it('keeps the starting output inside capacity', () => {
    expect(errorAt('startingOutput', { capacity: 30, startingOutput: 40 })).toBe(
      'The starting output (40) cannot be more than capacity (30).',
    );
    expect(validateSettings({ capacity: 40, startingOutput: 40 }).ok).toBe(true);
  });

  it('allows at most one decimal on capacity and the starting output', () => {
    expect(errorAt('capacity', { capacity: 75.25 })).toBe(
      'Capacity can have at most one decimal place, like 38.3.',
    );
    expect(errorAt('startingOutput', { startingOutput: 40.25 })).toBe(
      'The starting output can have at most one decimal place, like 38.3.',
    );
  });

  it('keeps every scheduled activity below the last year', () => {
    expect(
      errorAt('schedule.0.afterYear', {
        years: 12,
        schedule: [{ afterYear: 12, kind: 'chat', seconds: 240 }],
      }),
    ).toBe(
      'An activity has to come after a year that is still followed by another year. This game has 12 years, so choose a year from 1 to 11.',
    );
    expect(
      errorAt('schedule.1.afterYear', {
        years: 8,
        schedule: [
          { afterYear: 3, kind: 'chat', seconds: 240 },
          { afterYear: 9, kind: 'summit', seconds: 300 },
        ],
      }),
    ).toMatch(/This game has 8 years, so choose a year from 1 to 7\./);
  });

  it('keeps the new producer inside the years that are played', () => {
    expect(errorAt('newProducer.year', { years: 8, newProducer: { year: 9 } })).toBe(
      'The new producer has to arrive in a year that is played. This game has 8 years, so choose a year from 1 to 8.',
    );
    // A year past the end is harmless when the new producer is switched off.
    expect(
      errorAt('newProducer.year', { years: 8, newProducer: { enabled: false, year: 9 } }),
    ).toBe('');
  });

  it('keeps a demand event inside the years that are played', () => {
    expect(
      errorAt('demandEvent.year', { years: 8, demandEvent: { enabled: true, year: 12 } }),
    ).toBe(
      'The demand change has to happen in a year that is played. This game has 8 years, so choose a year from 1 to 8.',
    );
  });

  it('keeps a per-year timer override inside the years that are played', () => {
    expect(
      errorAt('timers.perYear.0.year', {
        years: 8,
        timers: { perYear: [{ year: 14, seconds: 60 }] },
      }),
    ).toBe('There is no Year 14 in this game. Use 0 for the practice year, or 1 to 8.');
    // Year 0 is the practice year, which every game has.
    expect(
      errorAt('timers.perYear.0.year', {
        years: 8,
        timers: { perYear: [{ year: 0, seconds: 60 }] },
      }),
    ).toBe('');
  });

  it('keeps the long early-year timer inside the years that are played', () => {
    expect(
      errorAt('timers.earlyYearsThrough', { years: 2, timers: { earlyYearsThrough: 3 } }),
    ).toBe(
      'The longer early-year timer cannot cover more years than the game has. This game has 2 years.',
    );
  });

  it('tells a teacher who shortened the game that the schedule no longer fits', () => {
    // The standard schedule has a chat after Year 10, so dropping to 8 years
    // has to be pointed out rather than silently dropped.
    expect(errorAt('schedule.2.afterYear', { years: 8 })).toMatch(
      /This game has 8 years, so choose a year from 1 to 7\./,
    );
  });

  it('reports every problem at once, each against its own field', () => {
    const result = validateSettings({ a: 1, cost: 2, b: 0, capacity: 10, startingOutput: 40 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((e) => e.path).sort()).toEqual(['a', 'b', 'startingOutput']);
      for (const error of result.errors) expect(error.message.length).toBeGreaterThan(10);
    }
  });
});

describe('simple field rules', () => {
  it('keeps worlds between 1 and 6', () => {
    expect(validateSettings({ worlds: 1 }).ok).toBe(true);
    expect(validateSettings({ worlds: 6 }).ok).toBe(true);
    expect(validateSettings({ worlds: 0 }).ok).toBe(false);
    expect(validateSettings({ worlds: 7 }).ok).toBe(false);
  });

  it('keeps variance between 0 and 50 per cent, as a whole number', () => {
    expect(validateSettings({ variancePct: 0 }).ok).toBe(true);
    expect(validateSettings({ variancePct: 50 }).ok).toBe(true);
    expect(validateSettings({ variancePct: 51 }).ok).toBe(false);
    expect(validateSettings({ variancePct: 2.5 }).ok).toBe(false);
  });

  it('only knows the three disclosure modes and the three chat modes', () => {
    expect(validateSettings({ disclosure: 'priceOnly' }).ok).toBe(true);
    expect(validateSettings({ disclosure: 'everything' }).ok).toBe(false);
    expect(validateSettings({ chatMode: 'always' }).ok).toBe(true);
    expect(validateSettings({ chatMode: 'sometimes' }).ok).toBe(false);
  });

  it('only knows chat and summit activities', () => {
    expect(validateSettings({ schedule: [{ afterYear: 2, kind: 'party', seconds: 60 }] }).ok).toBe(
      false,
    );
  });

  it('keeps timers between 5 s and an hour', () => {
    expect(validateSettings({ timers: { laterYearSeconds: 5 } }).ok).toBe(true);
    expect(validateSettings({ timers: { laterYearSeconds: 4 } }).ok).toBe(false);
    expect(validateSettings({ timers: { laterYearSeconds: 3601 } }).ok).toBe(false);
  });
});

describe('derived values', () => {
  it('converts the economic settings to whole units once', () => {
    expect(economicUnits(PRESETS['standard-75'])).toEqual({
      aCents: 7000,
      bHundredths: 30,
      costCents: 100,
      capacityTenths: 750,
      startingOutputTenths: 400,
    });
  });

  it('picks the timer for a year', () => {
    const s = PRESETS['standard-75'];
    expect(secondsForYear(0, s)).toBe(120);
    expect(secondsForYear(1, s)).toBe(150);
    expect(secondsForYear(3, s)).toBe(150);
    expect(secondsForYear(4, s)).toBe(120);
    expect(secondsForYear(12, s)).toBe(120);
  });

  it('lets a per-year override win', () => {
    const s = parseSettings({
      timers: {
        perYear: [
          { year: 0, seconds: 300 },
          { year: 2, seconds: 30 },
        ],
      },
    });
    expect(secondsForYear(0, s)).toBe(300);
    expect(secondsForYear(2, s)).toBe(30);
    expect(secondsForYear(3, s)).toBe(150);
  });

  it('lists the activities that follow a year', () => {
    const s = PRESETS['standard-75'];
    expect(activitiesAfterYear(3, s)).toEqual([{ afterYear: 3, kind: 'chat', seconds: 240 }]);
    expect(activitiesAfterYear(7, s)).toEqual([{ afterYear: 7, kind: 'summit', seconds: 300 }]);
    expect(activitiesAfterYear(4, s)).toEqual([]);
  });
});

describe('parseSettings', () => {
  it('returns the settings when they are good', () => {
    expect(parseSettings({}).years).toBe(12);
  });

  it('throws with every problem listed, for presets and tests', () => {
    expect(() => parseSettings({ b: 0 })).toThrow(/The slope \(b\) must be more than 0/);
  });

  it('exposes the schema itself, for commands that embed settings later', () => {
    expect(settingsSchema.safeParse({}).success).toBe(true);
  });
});
