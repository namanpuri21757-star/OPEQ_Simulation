import { describe, expect, it } from 'vitest';
import { COUNTRY_NAMES, JOIN_CODE_ALPHABET } from '@shared/constants';
import { teamLabel, yearLabel } from '@shared/labels';

describe('teamLabel', () => {
  it('uses the exact wording from the spec', () => {
    expect(teamLabel(2, 'B')).toBe('World 2 - Borvia (B)');
  });

  it('names every country', () => {
    expect(teamLabel(1, 'A')).toBe('World 1 - Ardonia (A)');
    expect(teamLabel(3, 'C')).toBe('World 3 - Cendra (C)');
  });
});

describe('yearLabel', () => {
  it('calls year 0 the practice year', () => {
    expect(yearLabel(0)).toBe('PRACTICE');
  });

  it('numbers the scored years', () => {
    expect(yearLabel(5)).toBe('Year 5');
  });
});

describe('join code alphabet', () => {
  it('leaves out look-alike characters', () => {
    for (const bad of ['0', 'O', '1', 'I', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(bad);
    }
  });

  it('has no repeats', () => {
    expect(new Set(JOIN_CODE_ALPHABET).size).toBe(JOIN_CODE_ALPHABET.length);
  });
});

describe('country names', () => {
  it('matches the spec', () => {
    expect(COUNTRY_NAMES).toEqual({ A: 'Ardonia', B: 'Borvia', C: 'Cendra' });
  });
});
