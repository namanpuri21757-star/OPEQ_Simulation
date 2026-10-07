/**
 * The setup form, described as data (SPEC 8.4).
 *
 * Every advanced setting is one row in this table rather than one hand-written
 * block of JSX. That is what keeps the five groups consistent - every field gets
 * a real label, a hint and its own validation message in the same place - and it
 * means adding a setting to `Settings` is a one-line change here rather than a
 * new slab of markup.
 *
 * The validation messages are never written here: they come from
 * validateSettings, so the form says exactly what the server would say.
 */

import {
  CHAT_MODES,
  DISCLOSURE_MODES,
  validateSettings,
  type Settings,
  type SettingsError,
} from '@shared/settings';

export type FieldKind = 'decimal' | 'integer' | 'boolean' | 'choice' | 'text';

export interface FieldSpec {
  /** A dotted path into Settings, for example "timers.practiceSeconds". */
  path: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  choices?: ReadonlyArray<{ value: string; label: string }>;
  /** Shown after the field: "dollars a barrel", "seconds". */
  unit?: string;
}

export interface FieldGroup {
  name: string;
  /** One line telling a teacher what this group is for. */
  blurb: string;
  fields: readonly FieldSpec[];
}

const DISCLOSURE_LABELS: Record<(typeof DISCLOSURE_MODES)[number], string> = {
  full: 'Full - everyone in a world sees each country’s output',
  totalOnly: 'Total only - the world total and the price',
  priceOnly: 'Price only - just the price',
};

const CHAT_LABELS: Record<(typeof CHAT_MODES)[number], string> = {
  off: 'Off - no messages at all',
  windowsOnly: 'Chat windows only - messages during the scheduled windows',
  always: 'Always - messages any time',
};

export const SETTINGS_GROUPS: readonly FieldGroup[] = [
  {
    name: 'Market',
    blurb: 'The price line and what each country can do. These set every number in the game.',
    fields: [
      {
        path: 'a',
        label: 'Highest price (a)',
        kind: 'decimal',
        unit: 'dollars a barrel',
        hint: 'The price when nobody produces anything.',
      },
      {
        path: 'b',
        label: 'Slope (b)',
        kind: 'decimal',
        unit: 'dollars per million barrels',
        hint: 'How far the price falls for each extra million barrels.',
      },
      { path: 'cost', label: 'Cost per barrel', kind: 'decimal', unit: 'dollars' },
      {
        path: 'capacity',
        label: 'Capacity',
        kind: 'decimal',
        unit: 'million barrels',
        hint: 'The most one country can produce in a year.',
      },
      {
        path: 'startingOutput',
        label: 'Starting output',
        kind: 'decimal',
        unit: 'million barrels',
        hint: 'What a country produces if it sends nothing in the practice year or Year 1.',
      },
      {
        path: 'variancePct',
        label: 'Production variance',
        kind: 'integer',
        unit: 'percent',
        hint: '0 turns it off. Above 0, actual output wobbles around the target.',
      },
    ],
  },
  {
    name: 'Timing',
    blurb: 'How long the lesson runs and how long each year is open.',
    fields: [
      { path: 'years', label: 'Scored years', kind: 'integer', unit: 'years' },
      { path: 'timers.practiceSeconds', label: 'Practice year', kind: 'integer', unit: 'seconds' },
      { path: 'timers.earlyYearSeconds', label: 'Early years', kind: 'integer', unit: 'seconds' },
      { path: 'timers.laterYearSeconds', label: 'Later years', kind: 'integer', unit: 'seconds' },
      {
        path: 'timers.earlyYearsThrough',
        label: 'Early years run through',
        kind: 'integer',
        unit: 'years',
        hint: 'Years 1 to this number get the longer timer.',
      },
      {
        path: 'autoClose',
        label: 'Close a year as soon as everyone has submitted',
        kind: 'boolean',
      },
    ],
  },
  {
    name: 'Communication',
    blurb: 'What teams may say to each other, and what they get to see.',
    fields: [
      {
        path: 'chatMode',
        label: 'When teams may send messages',
        kind: 'choice',
        choices: CHAT_MODES.map((mode) => ({ value: mode, label: CHAT_LABELS[mode] })),
      },
      {
        path: 'disclosure',
        label: 'What a team sees after a year',
        kind: 'choice',
        choices: DISCLOSURE_MODES.map((mode) => ({ value: mode, label: DISCLOSURE_LABELS[mode] })),
      },
      {
        path: 'rotateEvery',
        label: 'Jobs rotate every',
        kind: 'integer',
        unit: 'years',
        hint: 'Operator, Analyst and Envoy swap round this often.',
      },
    ],
  },
  {
    name: 'Events',
    blurb: 'The surprises that change how a class behaves.',
    fields: [
      { path: 'newProducer.enabled', label: 'A new producer joins', kind: 'boolean' },
      { path: 'newProducer.year', label: 'New producer arrives in year', kind: 'integer' },
      {
        path: 'newProducer.output',
        label: 'New producer output',
        kind: 'decimal',
        unit: 'million barrels',
      },
      {
        path: 'newProducer.announced',
        label: 'Say so in the news when it arrives',
        kind: 'boolean',
        hint: 'Off by default, so the price drop is a surprise.',
      },
      { path: 'demandEvent.enabled', label: 'Demand changes one year', kind: 'boolean' },
      { path: 'demandEvent.year', label: 'Demand changes in year', kind: 'integer' },
      {
        path: 'demandEvent.deltaA',
        label: 'Change to the highest price (a)',
        kind: 'decimal',
        unit: 'dollars',
      },
      { path: 'demandEvent.message', label: 'What the news says', kind: 'text' },
      { path: 'demandEvent.announced', label: 'Announce the demand change', kind: 'boolean' },
      {
        path: 'finalYearWarning',
        label: 'Warn the class before the last year',
        kind: 'boolean',
        hint: 'Turn it off to keep the end of the game secret.',
      },
    ],
  },
  {
    name: 'Display',
    blurb: 'What the projector shows the room.',
    fields: [
      {
        path: 'projectorShowsPrices',
        label: 'Show each world’s price on the projector after a reveal',
        kind: 'boolean',
      },
    ],
  },
];

/** Every field, flattened, for the tests and for looking a path up. */
export const ALL_FIELDS: readonly FieldSpec[] = SETTINGS_GROUPS.flatMap((group) => group.fields);

// ---------------------------------------------------------------------------
// Reading and writing one field of a draft.
// ---------------------------------------------------------------------------

type Draft = Record<string, unknown>;

/** The value at a dotted path, or undefined when the path is not there. */
export function getAt(draft: unknown, path: string): unknown {
  let here: unknown = draft;
  for (const step of path.split('.')) {
    if (typeof here !== 'object' || here === null) return undefined;
    here = (here as Draft)[step];
  }
  return here;
}

/**
 * A copy of the draft with one dotted path changed.
 *
 * Every level on the way down is copied rather than written through, so React
 * sees a new object and a half-finished edit can always be thrown away.
 */
export function setAt<T extends object>(draft: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined) return draft;
  const copy = { ...(draft as Draft) };
  if (rest.length === 0) {
    copy[head] = value;
  } else {
    const inner = copy[head];
    copy[head] = setAt(
      typeof inner === 'object' && inner !== null ? { ...(inner as Draft) } : {},
      rest.join('.'),
      value,
    );
  }
  return copy as T;
}

// ---------------------------------------------------------------------------
// Validation.
// ---------------------------------------------------------------------------

export interface FormProblems {
  /** One message per field path. Fields with no problem are absent. */
  byPath: Record<string, string>;
  /** Anything that could not be tied to a field on screen. */
  other: string[];
  /** The parsed settings, when every field is good. */
  settings: Settings | null;
}

/** Shown for a field whose text is not a number yet, before zod ever sees it. */
export const NOT_A_NUMBER = 'That is not a number yet. Type digits, like 70 or 0.3.';

/**
 * Checks a draft and sorts the messages by field.
 *
 * `typedProblems` carries the fields whose text could not be read as a number at
 * all. Those never reach validateSettings, because a draft that still holds the
 * old number would otherwise look perfectly valid while the field on screen is
 * showing "7o".
 */
export function checkDraft(
  draft: unknown,
  typedProblems: Readonly<Record<string, string>> = {},
): FormProblems {
  const byPath: Record<string, string> = { ...typedProblems };
  const other: string[] = [];

  const result = validateSettings(draft);
  if (!result.ok) {
    for (const error of result.errors) {
      const path = fieldPathFor(error);
      if (path === null) other.push(error.message);
      else byPath[path] ??= error.message;
    }
  }

  const clean = result.ok && Object.keys(typedProblems).length === 0;
  return { byPath, other, settings: clean && result.ok ? result.settings : null };
}

/**
 * Which field on screen an error belongs to.
 *
 * zod reports a path into the settings object; the schedule editor and the
 * worlds picker are not in SETTINGS_GROUPS, so they are matched by their prefix
 * and everything else falls through to the group-level list.
 */
function fieldPathFor(error: SettingsError): string | null {
  if (error.path === '') return null;
  if (ALL_FIELDS.some((field) => field.path === error.path)) return error.path;
  if (error.path === 'worlds') return 'worlds';
  if (error.path.startsWith('schedule')) return 'schedule';
  if (error.path.startsWith('timers.perYear')) return 'timers.perYear';
  // A nested path such as "newProducer.year" that is already a field is caught
  // above; anything left is a rule about the whole form.
  return null;
}
