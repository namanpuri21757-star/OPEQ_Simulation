import { formatQuantity } from '@shared/units';

/**
 * The same number as a slider, for a group that would rather drag than type.
 *
 * It works from the keyboard for free (arrow keys, Home, End) and reports its
 * value in million barrels rather than in tenths, which is what the group says
 * out loud.
 */
export interface SliderProps {
  id: string;
  label: string;
  tenths: number;
  maxTenths: number;
  onChange(tenths: number): void;
  disabled?: boolean;
}

export function Slider({ id, label, tenths, maxTenths, onChange, disabled = false }: SliderProps) {
  return (
    <div className="slider">
      <label className="slider-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="slider-input"
        type="range"
        min={0}
        max={maxTenths}
        step={1}
        value={tenths}
        disabled={disabled}
        aria-valuetext={`${formatQuantity(tenths)} million barrels`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="slider-ends" aria-hidden="true">
        <span>0</span>
        <span>{formatQuantity(maxTenths)}</span>
      </div>
    </div>
  );
}
