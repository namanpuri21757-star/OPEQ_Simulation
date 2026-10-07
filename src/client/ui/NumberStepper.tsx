import { formatQuantity } from '@shared/units';
import { Button } from './Button';

/**
 * A production number: a text field with -1, -0.1, +0.1 and +1 beside it.
 *
 * The field holds text, not a number, because the message a student gets for
 * "38.35" or "forty" has to name what went wrong (parseQuantity does that), and
 * a browser number input would simply swallow it.
 */
export interface NumberStepperProps {
  id: string;
  label: string;
  /** Exactly what is in the field. */
  value: string;
  onChange(text: string): void;
  /** The parsed value in tenths, or null while the text is not a number yet. */
  tenths: number | null;
  maxTenths: number;
  disabled?: boolean;
  /** The id of the message that explains or corrects this field. */
  describedBy?: string | undefined;
  /** Shown under the field, for example "0 to 75.0 million barrels". */
  hint?: string | undefined;
}

const STEPS = [10, 1];

export function NumberStepper({
  id,
  label,
  value,
  onChange,
  tenths,
  maxTenths,
  disabled = false,
  describedBy,
  hint,
}: NumberStepperProps) {
  const step = (by: number) => {
    const from = tenths ?? 0;
    const next = Math.min(maxTenths, Math.max(0, from + by));
    onChange(formatQuantity(next));
  };

  return (
    <div className="stepper">
      <label className="stepper-label" htmlFor={id}>
        {label}
      </label>
      <div className="stepper-row">
        {STEPS.map((by) => (
          <Button
            key={`down-${String(by)}`}
            onClick={() => step(-by)}
            disabled={disabled}
            aria-label={`${formatQuantity(by)} million barrels less`}
          >
            {`-${formatQuantity(by)}`}
          </Button>
        ))}
        <input
          id={id}
          className="stepper-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
        {[...STEPS].reverse().map((by) => (
          <Button
            key={`up-${String(by)}`}
            onClick={() => step(by)}
            disabled={disabled}
            aria-label={`${formatQuantity(by)} million barrels more`}
          >
            {`+${formatQuantity(by)}`}
          </Button>
        ))}
        <span className="stepper-unit">million barrels</span>
      </div>
      {hint !== undefined && <p className="hint">{hint}</p>}
    </div>
  );
}
