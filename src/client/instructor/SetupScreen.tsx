import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MAX_WORLDS, MIN_WORLDS } from '@shared/constants';
import { PRESETS, PRESET_NAMES, type PresetName, type SettingsInput } from '@shared/settings';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Banner, Button, type Say } from '../ui';
import { AdvancedSettings } from './AdvancedSettings';
import { SettingsPreview } from './SettingsPreview';
import { ALL_FIELDS, NOT_A_NUMBER, checkDraft, setAt } from './settingsForm';

/**
 * The lesson settings, on a page of their own (SPEC 8.4).
 *
 * In v1 this form was the first thing a teacher saw, which put a decision in
 * front of them before they knew what the game was. It is now a link in the
 * corner of the start screen: a teacher who wants the standard lesson never has
 * to come here at all, and one who does arrives knowing what they want to
 * change.
 *
 * Three sections and one obvious next step: pick the shape, say how many worlds,
 * read the preview, save.
 */
const PRESET_BLURB: Record<PresetName, string> = {
  'standard-75': 'About 75 minutes. 12 years, two messaging windows, a summit and a new producer.',
  'short-50': 'About 50 minutes. 8 years, one messaging window, no summit.',
  'long-90': 'About 90 minutes. 16 years, two messaging windows and a summit.',
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
  const locked = view.phase !== 'LOBBY';

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
    const trimmed = raw.trim();
    if (!NUMBER_SHAPE.test(trimmed) || (INTEGER_PATHS.has(path) && trimmed.includes('.'))) {
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
    <main className="sheet">
      <header className="teacher-band">
        <h1 className="teacher-title">Lesson settings</h1>
        <p className="teacher-facts">{`Session ${view.sessionId}`}</p>
      </header>

      {locked && (
        <Banner tone="alert" title="Locked">
          The game has started, so the settings cannot be changed now. Reset the game first if you
          need to.
        </Banner>
      )}

      <div className="stack">
        <section className="box" aria-labelledby="shape-heading">
          <h2 className="step-title" id="shape-heading">
            <span className="step-no">1</span> The shape of the lesson
          </h2>
          <fieldset className="presets" style={{ marginTop: 'var(--s4)' }}>
            <legend>Choose one</legend>
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
                  <br />
                  <span className="note">{PRESET_BLURB[name]}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="box" aria-labelledby="worlds-heading">
          <h2 className="step-title" id="worlds-heading">
            <span className="step-no">2</span> How many worlds
          </h2>
          <div className="field-row" style={{ marginTop: 'var(--s4)' }}>
            <label className="field-label" htmlFor="setting-worlds" style={{ marginBottom: 0 }}>
              Worlds
            </label>
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
          </div>
          <p className="note" id="worlds-hint" style={{ marginTop: 'var(--s3)' }}>
            Each world has 3 countries, so one world is 3 groups. With 25 students, 3 worlds gives 9
            groups of 2 or 3.
          </p>
          {problems.byPath['worlds'] !== undefined && (
            <p className="problem" role="alert">
              {problems.byPath['worlds']}
            </p>
          )}
        </section>

        <section className="box" aria-labelledby="preview-heading">
          <h2 className="step-title" id="preview-heading">
            <span className="step-no">3</span> What these numbers pay
          </h2>
          {problems.settings !== null ? (
            <SettingsPreview settings={problems.settings} />
          ) : (
            <p className="note">
              The preview comes back as soon as every setting is a number the game can use.
            </p>
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
        </section>

        <section className="box">
          <AdvancedSettings
            draft={draft}
            texts={texts}
            problems={problems.byPath}
            onChange={onChange}
            onToggle={(path, value) => setDraft((current) => setAt(current, path, value))}
            onSchedule={(schedule) => setDraft((current) => ({ ...current, schedule }))}
          />
        </section>

        <section className="box">
          <div className="btn-row">
            <Button tone="primary" onClick={() => void save()} disabled={busy || locked}>
              Save settings
            </Button>
            <Button onClick={download}>Save to a file</Button>
            <Button onClick={() => fileInput.current?.click()}>Load from a file</Button>
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
        </section>
      </div>

      <p className="teacher-corner">
        <Link to="/instructor">Back to the start screen</Link>
      </p>
    </main>
  );
}
