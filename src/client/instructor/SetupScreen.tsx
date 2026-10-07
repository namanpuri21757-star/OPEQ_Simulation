import { useRef, useState } from 'react';
import { MAX_WORLDS, MIN_WORLDS } from '@shared/constants';
import { PRESETS, PRESET_NAMES, type PresetName, type SettingsInput } from '@shared/settings';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Banner, Button, type Say } from '../ui';
import { AdvancedSettings } from './AdvancedSettings';
import { SettingsPreview } from './SettingsPreview';
import { ALL_FIELDS, NOT_A_NUMBER, checkDraft, setAt } from './settingsForm';

/**
 * The setup screen (SPEC 8.4): pick a preset, say how many worlds, and change
 * anything else only if you want to.
 *
 * The one rule driving the layout: a teacher setting this up has a class walking
 * in. The preset picker and the worlds box are the whole job, the preview tells
 * them whether the game still works, and everything else is folded away.
 */
const PRESET_BLURB: Record<PresetName, string> = {
  'standard-75': 'About 75 minutes. 12 years, a chat window, a summit and a new producer.',
  'short-50': 'About 50 minutes. 8 years, one chat window, no summit.',
  'long-90': 'About 90 minutes. 16 years, two chat windows and a summit.',
  'test-fast': 'Five-second years. For trying the software out, not for a class.',
};

/** What a preset looks like as something the form can edit. */
function draftFor(name: PresetName, worlds: number): SettingsInput {
  return { ...PRESETS[name], worlds };
}

/** The whole-number fields. Everything else may have a decimal point. */
const INTEGER_PATHS = new Set([
  'worlds',
  ...ALL_FIELDS.filter((field) => field.kind === 'integer').map((field) => field.path),
]);

const NUMBER_SHAPE = /^\d+(?:\.\d*)?$/;
/** The demand change is the one setting that may be negative. */
const SIGNED_SHAPE = /^-?\d+(?:\.\d*)?$/;

export interface SetupScreenProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
}

export function SetupScreen({ view, send, onSaid }: SetupScreenProps) {
  const [preset, setPreset] = useState<PresetName>('standard-75');
  const [draft, setDraft] = useState<SettingsInput>(() => ({ ...view.settings }));
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const problems = checkDraft(draft, typed);

  /** Replaces the whole draft: a preset, or a loaded file. */
  const replace = (next: SettingsInput) => {
    setDraft(next);
    setTexts({});
    setTyped({});
  };

  /**
   * One box changed. The text is kept exactly as typed, and the draft only moves
   * when the text reads as a number, so "0." is not silently turned into 0.
   */
  const onChange = (path: string, raw: string) => {
    const field = ALL_FIELDS.find((candidate) => candidate.path === path);
    if (field?.kind === 'text' || field?.kind === 'choice') {
      setDraft((current) => setAt(current, path, raw));
      return;
    }

    setTexts((current) => ({ ...current, [path]: raw }));
    const shape = path === 'demandEvent.deltaA' ? SIGNED_SHAPE : NUMBER_SHAPE;
    const trimmed = raw.trim();
    if (!shape.test(trimmed) || (INTEGER_PATHS.has(path) && trimmed.includes('.'))) {
      setTyped((current) => ({ ...current, [path]: NOT_A_NUMBER }));
      return;
    }
    setTyped((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    setDraft((current) => setAt(current, path, Number(trimmed)));
  };

  const save = async () => {
    if (problems.settings === null) {
      onSaid('Some settings still need fixing. The messages are next to them.', 'bad');
      return;
    }
    setBusy(true);
    const ack = await send('updateSettings', { settings: problems.settings });
    setBusy(false);
    onSaid(ack.ok ? 'Settings saved.' : ack.message, ack.ok ? 'good' : 'bad');
  };

  /** Writes the draft out as a file the teacher can keep or share. */
  const download = () => {
    const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crude-accord-settings.json';
    link.click();
    URL.revokeObjectURL(url);
    onSaid('Settings saved to a file.', 'good');
  };

  const load = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        onSaid('That file does not look like a settings file.', 'bad');
        return;
      }
      replace(parsed as SettingsInput);
      onSaid('Settings loaded from the file. Check them, then save.', 'good');
    } catch {
      onSaid('That file could not be read as settings.', 'bad');
    }
  };

  const worlds = draft.worlds ?? MIN_WORLDS;

  return (
    <section className="panel setup" aria-labelledby="setup-heading">
      <h2 id="setup-heading">Set the game up</h2>

      <fieldset className="presets">
        <legend>Choose a shape for the lesson</legend>
        {PRESET_NAMES.map((name) => (
          <label className="preset" key={name} htmlFor={`preset-${name}`}>
            <input
              id={`preset-${name}`}
              type="radio"
              name="preset"
              value={name}
              checked={preset === name}
              onChange={() => {
                setPreset(name);
                replace(draftFor(name, worlds));
              }}
            />
            <span>
              <strong>{name}</strong>
              <span className="hint">{PRESET_BLURB[name]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="field">
        <label htmlFor="setting-worlds">How many worlds?</label>
        <span className="field-row">
          <input
            id="setting-worlds"
            className="field-number"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-describedby="worlds-hint"
            value={texts['worlds'] ?? String(worlds)}
            onChange={(event) => onChange('worlds', event.target.value)}
          />
          <span className="field-unit">{`${String(MIN_WORLDS)} to ${String(MAX_WORLDS)}`}</span>
        </span>
        <span className="hint" id="worlds-hint">
          Each world has 3 countries, so one world is 3 groups. With 25 students, 3 worlds of 3
          groups gives 9 groups of 2 or 3.
        </span>
        {problems.byPath['worlds'] !== undefined && (
          <span className="problem" role="alert">
            {problems.byPath['worlds']}
          </span>
        )}
      </p>

      {problems.settings !== null && <SettingsPreview settings={problems.settings} />}
      {problems.settings === null && (
        <Banner tone="warning" title="Preview">
          The preview comes back as soon as every setting is a number the game can use.
        </Banner>
      )}

      {problems.other.length > 0 && (
        <div role="alert">
          {problems.other.map((message) => (
            <p className="problem" key={message}>
              {message}
            </p>
          ))}
        </div>
      )}

      <AdvancedSettings
        draft={draft}
        texts={texts}
        problems={problems.byPath}
        onChange={onChange}
        onToggle={(path, value) => setDraft((current) => setAt(current, path, value))}
        onSchedule={(schedule) => setDraft((current) => ({ ...current, schedule }))}
      />

      <div className="row">
        <Button tone="primary" onClick={() => void save()} disabled={busy}>
          Save settings
        </Button>
        <Button onClick={download}>Save settings to a file</Button>
        <Button onClick={() => fileInput.current?.click()}>Load settings from a file</Button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          aria-label="Settings file to load"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void load(file);
            event.target.value = '';
          }}
        />
      </div>
      <p className="hint">
        Settings can only be changed before the briefing starts. Save them, then hand out the cards.
      </p>
    </section>
  );
}
