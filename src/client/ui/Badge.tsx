import { COUNTRY_NAMES, type CountryLetter } from '@shared/constants';

/**
 * A country's badge: a shape AND its letter, never colour alone (SPEC 8.3).
 *
 * Ardonia is a circle, Borvia a triangle, Cendra a square. A student who cannot
 * tell the colours apart, or a printed card in black and white, still reads it.
 */
const SHAPE: Record<CountryLetter, 'circle' | 'triangle' | 'square'> = {
  A: 'circle',
  B: 'triangle',
  C: 'square',
};

export interface BadgeProps {
  letter: CountryLetter;
  /** "large" is for the header of the team's own screen. */
  size?: 'small' | 'normal' | 'large';
  /** Adds the country name next to the badge. */
  withName?: boolean;
}

function Shape({ letter }: { letter: CountryLetter }) {
  const shape = SHAPE[letter];
  if (shape === 'circle') return <circle cx="20" cy="20" r="17" />;
  if (shape === 'square') return <rect x="4" y="4" width="32" height="32" rx="3" />;
  return <polygon points="20,3 37,35 3,35" />;
}

export function Badge({ letter, size = 'normal', withName = false }: BadgeProps) {
  const name = COUNTRY_NAMES[letter];
  return (
    <span className={`badge badge-${size} badge-${letter}`}>
      <svg viewBox="0 0 40 40" className="badge-art" aria-hidden="true" focusable="false">
        <g className="badge-shape">
          <Shape letter={letter} />
        </g>
        <text x="20" y="20" className="badge-letter" dominantBaseline="central" textAnchor="middle">
          {letter}
        </text>
      </svg>
      <span className="visually-hidden">
        {withName ? `(${letter}, a ${SHAPE[letter]})` : `${name} (${letter}, a ${SHAPE[letter]})`}
      </span>
      {withName && <span className="badge-name">{name}</span>}
    </span>
  );
}
