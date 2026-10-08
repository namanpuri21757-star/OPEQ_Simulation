import type { ActivityKind, SettingsInput } from '@shared/settings';
import { Button } from '../ui';
import { SETTINGS_GROUPS, getAt, type FieldGroup, type FieldSpec } from './settingsForm';

/**
 * Every advanced setting, folded away until a teacher asks for it (SPEC 8.4).
 *
 * The five groups come from SETTINGS_GROUPS, so this file is only about turning
 * one field description into one accessible control: a real <label>, the hint and
 * the message tied to the field with aria-describedby, and the unit spelled out
 * next to the box rather than hidden in the label.
 */
export interface AdvancedSettingsProps {
  draft: SettingsInput;
  /** The text in each box, which may not be a number yet. */
  texts: Readonly<Record<string, string>>;
  problems: Readonly<Record<string, string>>;
  onChange(path: string, raw: string): void;
  onToggle(path: string, value: boolean): void;
  onSchedule(schedule: NonNullable<SettingsInput['schedule']>): void;
}

/** What a box shows: the half-typed text if there is one, else the real value. */
function shownValue(draft: SettingsInput, texts: Readonly<Record<string, string>>, path: string) {
  const typed = texts[path];
  if (typed !== undefined) return typed;
  const value = getAt(draft, path);
  return value === undefined || value === null ? '' : String(value);
}

function Field({
  field,
  draft,
  texts,
  problems,
  onChange,
  onToggle,
}: Omit<AdvancedSettingsProps, 'onSchedule'> & { field: FieldSpec }) {
  const id = `setting-${field.path.replace(/\./g, '-')}`;
  const problem = problems[field.path];
  const hintId = field.hint === undefined ? null : `${id}-hint`;
  const problemId = problem === undefined ? null : `${id}-problem`;
  const describedBy = [problemId, hintId].filter(Boolean).join(' ') || undefined;

  if (field.kind === 'boolean') {
    return (
      <p className="field field-check">
        <input
          id={id}
          type="checkbox"
          checked={getAt(draft, field.path) === true}
          aria-describedby={describedBy}
          onChange={(event) => onToggle(field.path, event.target.checked)}
        />
        <label htmlFor={id}>{field.label}</label>
        {field.hint !== undefined && (
          <span className="note" id={hintId ?? undefined}>
            {field.hint}
          </span>
        )}
      </p>
    );
  }

  if (field.kind === 'choice') {
    return (
      <p className="field">
        <label htmlFor={id}>{field.label}</label>
        <select
          id={id}
          value={String(getAt(draft, field.path) ?? '')}
          aria-describedby={describedBy}
          onChange={(event) => onChange(field.path, event.target.value)}
        >
          {(field.choices ?? []).map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        {field.hint !== undefined && (
          <span className="note" id={hintId ?? undefined}>
            {field.hint}
          </span>
        )}
        {problem !== undefined && (
          <span className="problem" id={problemId ?? undefined} role="alert">
            {problem}
          </span>
        )}
      </p>
    );
  }

  return (
    <p className="field">
      <label htmlFor={id}>{field.label}</label>
      <span className="field-row">
        <input
          id={id}
          className={field.kind === 'text' ? 'field-text' : 'field-number'}
          type="text"
          inputMode={field.kind === 'text' ? 'text' : 'decimal'}
          autoComplete="off"
          value={shownValue(draft, texts, field.path)}
          aria-describedby={describedBy}
          aria-invalid={problem === undefined ? undefined : true}
          onChange={(event) => onChange(field.path, event.target.value)}
        />
        {field.unit !== undefined && <span className="field-unit">{field.unit}</span>}
      </span>
      {field.hint !== undefined && (
        <span className="note" id={hintId ?? undefined}>
          {field.hint}
        </span>
      )}
      {problem !== undefined && (
        <span className="problem" id={problemId ?? undefined} role="alert">
          {problem}
        </span>
      )}
    </p>
  );
}

/**
 * The chat windows and summits, as rows a teacher can add to and take away.
 *
 * It is not in SETTINGS_GROUPS because it is a list rather than a value, and a
 * list needs its own buttons. The validation message for a badly placed activity
 * still comes from validateSettings, under the path "schedule".
 */
function ScheduleEditor({
  schedule,
  problem,
  onSchedule,
}: {
  schedule: NonNullable<SettingsInput['schedule']>;
  problem: string | undefined;
  onSchedule(schedule: NonNullable<SettingsInput['schedule']>): void;
}) {
  const change = (
    index: number,
    patch: Partial<{ afterYear: number; kind: ActivityKind; seconds: number }>,
  ) => {
    onSchedule(schedule.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  return (
    <fieldset className="schedule">
      <legend>Chat windows and summits</legend>
      <p className="note">
        Each one runs after the year you choose. A chat window is typed on the terminals; a summit
        sends the Envoys to a meeting point in the room.
      </p>

      {schedule.length === 0 && <p className="note">No activities. The years run back to back.</p>}

      {schedule.map((item, index) => (
        <div className="schedule-row" key={index}>
          <p className="field">
            <label htmlFor={`activity-${String(index)}-kind`}>What happens</label>
            <select
              id={`activity-${String(index)}-kind`}
              value={item.kind}
              onChange={(event) => change(index, { kind: event.target.value as ActivityKind })}
            >
              <option value="chat">Chat window</option>
              <option value="summit">Summit</option>
            </select>
          </p>
          <p className="field">
            <label htmlFor={`activity-${String(index)}-year`}>After year</label>
            <input
              id={`activity-${String(index)}-year`}
              className="field-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={String(item.afterYear)}
              onChange={(event) => change(index, { afterYear: Number(event.target.value) || 0 })}
            />
          </p>
          <p className="field">
            <label htmlFor={`activity-${String(index)}-seconds`}>Length (seconds)</label>
            <input
              id={`activity-${String(index)}-seconds`}
              className="field-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={String(item.seconds)}
              onChange={(event) => change(index, { seconds: Number(event.target.value) || 0 })}
            />
          </p>
          <Button
            onClick={() => onSchedule(schedule.filter((_, i) => i !== index))}
            aria-label={`Remove the ${item.kind === 'chat' ? 'chat window' : 'summit'} after year ${String(item.afterYear)}`}
          >
            Remove
          </Button>
        </div>
      ))}

      {problem !== undefined && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}

      <Button
        onClick={() => onSchedule([...schedule, { afterYear: 1, kind: 'chat', seconds: 240 }])}
      >
        Add an activity
      </Button>
    </fieldset>
  );
}

function Group({ group, ...rest }: AdvancedSettingsProps & { group: FieldGroup }) {
  const { draft, texts, problems, onChange, onToggle, onSchedule } = rest;
  return (
    <section className="settings-group" aria-labelledby={`group-${group.name}`}>
      <h3 id={`group-${group.name}`}>{group.name}</h3>
      <p className="note">{group.blurb}</p>
      {group.fields.map((field) => (
        <Field
          key={field.path}
          field={field}
          draft={draft}
          texts={texts}
          problems={problems}
          onChange={onChange}
          onToggle={onToggle}
        />
      ))}
      {group.name === 'Communication' && (
        <ScheduleEditor
          schedule={draft.schedule ?? []}
          problem={problems['schedule']}
          onSchedule={onSchedule}
        />
      )}
    </section>
  );
}

export function AdvancedSettings(props: AdvancedSettingsProps) {
  return (
    <details className="advanced">
      <summary>Advanced settings</summary>
      <p className="note">
        Everything here has a sensible default. Change it only if you want a different lesson - the
        preview above updates as you type.
      </p>
      {SETTINGS_GROUPS.map((group) => (
        <Group key={group.name} group={group} {...props} />
      ))}
    </details>
  );
}
