/**
 * Everything an instructor can change before a game starts (SPEC sections 3-7),
 * with the standard-75 preset as the defaults.
 *
 * Why the economic numbers (a, b, cost, capacity, startingOutput) are decimals
 * here and whole units everywhere else: these are the numbers a teacher types in
 * a form, in the units of the textbook (dollars per barrel, millions of
 * barrels). economicUnits() converts them once, and the engine only ever sees
 * whole cents and tenths after that.
 */

import { z } from 'zod';
import { MAX_WORLDS, MIN_WORLDS } from './constants.js';
import { decimalPlaces, toCents, toHundredths, toTenths } from './engine/integers.js';

export const DISCLOSURE_MODES = ['full', 'totalOnly', 'priceOnly'] as const;
export const CHAT_MODES = ['off', 'windowsOnly', 'always'] as const;
export const ACTIVITY_KINDS = ['chat', 'summit'] as const;

export type DisclosureMode = (typeof DISCLOSURE_MODES)[number];
export type ChatMode = (typeof CHAT_MODES)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Timers never go below 5 s, because test-fast uses exactly 5 s. */
const MIN_SECONDS = 5;
const MAX_SECONDS = 3600;
const MAX_YEARS = 40;

const money = (label: string) =>
  z
    .number()
    .finite()
    .refine((n) => decimalPlaces(n) <= 2, {
      message: `${label} can have at most 2 decimal places, like 70.25.`,
    });

const quantity = (label: string) =>
  z
    .number()
    .finite()
    .min(0, { message: `${label} cannot be less than 0.` })
    .refine((n) => decimalPlaces(n) <= 1, {
      message: `${label} can have at most one decimal place, like 38.3.`,
    });

const seconds = z.number().int().min(MIN_SECONDS).max(MAX_SECONDS);
const yearNumber = z.number().int().min(1).max(MAX_YEARS);

const activitySchema = z.strictObject({
  afterYear: yearNumber,
  kind: z.enum(ACTIVITY_KINDS),
  seconds,
});

const timerOverrideSchema = z.strictObject({
  /** Year 0 is the practice year everywhere in this project. */
  year: z.number().int().min(0).max(MAX_YEARS),
  seconds,
});

/**
 * The shape only. settingsSchema adds the checks that need more than one field.
 */
export const settingsShape = z.strictObject({
  worlds: z.number().int().min(MIN_WORLDS).max(MAX_WORLDS).default(3),

  /** Price when nobody produces, in dollars per barrel. */
  a: money('The highest price (a)').default(70),
  /** How many dollars the price falls per extra million barrels. */
  b: money('The slope (b)')
    .refine((n) => n > 0, {
      message: 'The slope (b) must be more than 0, or the price would never move.',
    })
    .default(0.3),
  /** Cost per barrel. */
  cost: money('The cost per barrel').default(1),
  /** The most one country can produce in a year, in millions of barrels. */
  capacity: quantity('Capacity')
    .refine((n) => n > 0, { message: 'Capacity must be more than 0.' })
    .default(75),
  /** What a country produces when it never submits in Year 1 or the practice year. */
  startingOutput: quantity('The starting output').default(40),

  years: z.number().int().min(1).max(MAX_YEARS).default(12),

  timers: z
    .strictObject({
      practiceSeconds: seconds.default(120),
      /** Years 1 to earlyYearsThrough get the longer timer. */
      earlyYearSeconds: seconds.default(150),
      laterYearSeconds: seconds.default(120),
      earlyYearsThrough: z.number().int().min(0).max(MAX_YEARS).default(3),
      perYear: z.array(timerOverrideSchema).default([]),
    })
    // prefault (not default) so a partly filled group still gets the rest of
    // its defaults: { practiceSeconds: 90 } keeps the standard 150 s early years.
    .prefault({}),

  disclosure: z.enum(DISCLOSURE_MODES).default('full'),
  /** 0 means production variance is off. */
  variancePct: z.number().int().min(0).max(50).default(0),
  chatMode: z.enum(CHAT_MODES).default('windowsOnly'),

  schedule: z.array(activitySchema).default([
    { afterYear: 3, kind: 'chat', seconds: 240 },
    { afterYear: 7, kind: 'summit', seconds: 300 },
    { afterYear: 10, kind: 'chat', seconds: 180 },
  ]),

  newProducer: z
    .strictObject({
      enabled: z.boolean().default(true),
      year: yearNumber.default(9),
      /** Millions of barrels a year. */
      output: quantity("The new producer's output").default(15),
      announced: z.boolean().default(false),
    })
    .prefault({}),

  demandEvent: z
    .strictObject({
      enabled: z.boolean().default(false),
      year: yearNumber.default(6),
      /** How much the highest price (a) moves, up or down. */
      deltaA: money('The demand change').default(-10),
      message: z.string().max(280).default('Demand has changed. Watch the price.'),
      /**
       * SPEC section 4 announces demand events in the news, so this is on by
       * default; it exists so the explanation can stay silent when it is off.
       */
      announced: z.boolean().default(true),
    })
    .prefault({}),

  finalYearWarning: z.boolean().default(true),
  /** Roles rotate every this many years (SPEC section 5). */
  rotateEvery: z.number().int().min(1).max(MAX_YEARS).default(4),
  autoClose: z.boolean().default(false),
  projectorShowsPrices: z.boolean().default(true),
});

export type Settings = z.output<typeof settingsShape>;
export type SettingsInput = z.input<typeof settingsShape>;

/** The full schema: shape plus the rules that compare fields with each other. */
export const settingsSchema = settingsShape.superRefine((s, ctx) => {
  const add = (path: Array<string | number>, message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  if (s.a <= s.cost) {
    add(
      ['a'],
      `The highest price (a) must be more than the cost per barrel, or no one could ever profit. Right now a is ${s.a} and cost is ${s.cost}.`,
    );
  }

  if (s.startingOutput > s.capacity) {
    add(
      ['startingOutput'],
      `The starting output (${s.startingOutput}) cannot be more than capacity (${s.capacity}).`,
    );
  }

  s.schedule.forEach((item, index) => {
    if (item.afterYear >= s.years) {
      add(
        ['schedule', index, 'afterYear'],
        `An activity has to come after a year that is still followed by another year. This game has ${s.years} years, so choose a year from 1 to ${s.years - 1}.`,
      );
    }
  });

  if (s.newProducer.enabled && s.newProducer.year > s.years) {
    add(
      ['newProducer', 'year'],
      `The new producer has to arrive in a year that is played. This game has ${s.years} years, so choose a year from 1 to ${s.years}.`,
    );
  }

  if (s.demandEvent.enabled && s.demandEvent.year > s.years) {
    add(
      ['demandEvent', 'year'],
      `The demand change has to happen in a year that is played. This game has ${s.years} years, so choose a year from 1 to ${s.years}.`,
    );
  }

  s.timers.perYear.forEach((item, index) => {
    if (item.year > s.years) {
      add(
        ['timers', 'perYear', index, 'year'],
        `There is no Year ${item.year} in this game. Use 0 for the practice year, or 1 to ${s.years}.`,
      );
    }
  });

  if (s.timers.earlyYearsThrough > s.years) {
    add(
      ['timers', 'earlyYearsThrough'],
      `The longer early-year timer cannot cover more years than the game has. This game has ${s.years} years.`,
    );
  }
});

/** One problem with a settings form, named by its field path. */
export interface SettingsError {
  path: string;
  message: string;
}

export type SettingsValidation =
  { ok: true; settings: Settings } | { ok: false; errors: SettingsError[] };

/**
 * Checks a settings object and fills in every default.
 *
 * Returns errors rather than throwing, because the instructor's setup screen
 * shows them all at once next to the fields they belong to.
 */
export function validateSettings(input: unknown): SettingsValidation {
  const result = settingsSchema.safeParse(input ?? {});
  if (result.success) return { ok: true, settings: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  };
}

/** Throws on bad settings. For presets and tests, never for a form. */
export function parseSettings(input: unknown): Settings {
  const result = validateSettings(input);
  if (result.ok) return result.settings;
  const lines = result.errors.map((e) => `${e.path || '(settings)'}: ${e.message}`).join('\n');
  throw new Error(`These settings cannot be used:\n${lines}`);
}

/** The whole units the engine works in. */
export interface EconomicUnits {
  aCents: number;
  bHundredths: number;
  costCents: number;
  capacityTenths: number;
  startingOutputTenths: number;
}

export function economicUnits(settings: Settings): EconomicUnits {
  return {
    aCents: toCents(settings.a),
    bHundredths: toHundredths(settings.b),
    costCents: toCents(settings.cost),
    capacityTenths: toTenths(settings.capacity),
    startingOutputTenths: toTenths(settings.startingOutput),
  };
}

/** How long a year gets: a per-year override first, then early or later. */
export function secondsForYear(year: number, settings: Settings): number {
  const override = settings.timers.perYear.find((item) => item.year === year);
  if (override) return override.seconds;
  if (year === 0) return settings.timers.practiceSeconds;
  return year <= settings.timers.earlyYearsThrough
    ? settings.timers.earlyYearSeconds
    : settings.timers.laterYearSeconds;
}

/** The activities that follow a given year, in the order they were listed. */
export function activitiesAfterYear(year: number, settings: Settings) {
  return settings.schedule.filter((item) => item.afterYear === year);
}

export const PRESET_NAMES = ['standard-75', 'short-50', 'long-90', 'test-fast'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/**
 * SPEC section 4 lists what each preset changes and nothing else, so the number
 * in a preset name is the rough length of the class in minutes, not a capacity.
 * Capacity stays 75 in all four.
 */
const PRESET_INPUTS: Record<PresetName, SettingsInput> = {
  'standard-75': {},

  'short-50': {
    years: 8,
    timers: { practiceSeconds: 90, earlyYearSeconds: 90, laterYearSeconds: 90 },
    schedule: [{ afterYear: 3, kind: 'chat', seconds: 240 }],
    newProducer: { year: 6 },
  },

  'long-90': {
    years: 16,
    schedule: [
      { afterYear: 3, kind: 'chat', seconds: 240 },
      { afterYear: 7, kind: 'summit', seconds: 300 },
      { afterYear: 12, kind: 'chat', seconds: 240 },
    ],
    newProducer: { year: 11 },
  },

  'test-fast': {
    timers: { practiceSeconds: 5, earlyYearSeconds: 5, laterYearSeconds: 5 },
    schedule: [
      { afterYear: 3, kind: 'chat', seconds: 5 },
      { afterYear: 7, kind: 'summit', seconds: 5 },
      { afterYear: 10, kind: 'chat', seconds: 5 },
    ],
  },
};

/** The four ready-made setups. Parsed once, so a broken preset fails loudly. */
export const PRESETS: Record<PresetName, Settings> = Object.fromEntries(
  PRESET_NAMES.map((name) => [name, parseSettings(PRESET_INPUTS[name])]),
) as Record<PresetName, Settings>;

export const DEFAULT_SETTINGS: Settings = PRESETS['standard-75'];
