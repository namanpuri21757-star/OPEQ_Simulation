import { describe, expect, it } from 'vitest';
import { clean, cleanMemberName, filterText } from '../../src/shared/filter.js';

describe('the word filter', () => {
  it('masks a blocked word and keeps the rest of the sentence', () => {
    const result = filterText('That was a stupid plan');
    expect(result.text).toBe('That was a ****** plan');
    expect(result.changed).toBe(true);
  });

  it('leaves ordinary words alone, even when one hides inside', () => {
    for (const phrase of [
      'The whole class agreed',
      'We passed the assessment',
      'Scunthorpe is a town',
      'Our analysis was careful',
    ]) {
      expect(filterText(phrase)).toEqual({ text: phrase, changed: false });
    }
  });

  it('sees through punctuation and look-alike characters', () => {
    // Only the letters are masked; the punctuation someone hid behind stays.
    expect(clean('s.h.i.t')).toBe('*.*.*.*');
    expect(clean('you are an 1d10t')).toBe('you are an *****');
  });

  it('masks the longest match, so no tail is left behind', () => {
    expect(clean('stop fucking about')).toBe('stop ******* about');
  });

  it('keeps the message rather than refusing it', () => {
    const result = filterText('damn, we lost');
    expect(result.text).toBe('****, we lost');
    expect(result.text).toContain('we lost');
  });

  it('is case blind', () => {
    expect(clean('STUPID')).toBe('******');
    expect(clean('Idiot')).toBe('*****');
  });

  it('does nothing to text with no letters at all', () => {
    expect(filterText('38.3')).toEqual({ text: '38.3', changed: false });
    expect(filterText('')).toEqual({ text: '', changed: false });
  });
});

describe('member names', () => {
  it('trims and collapses the spaces a student types', () => {
    expect(cleanMemberName('  Ada   Lovelace ', 0)).toBe('Ada Lovelace');
  });

  it('filters a name the same way as a message', () => {
    expect(cleanMemberName('Ada the stupid', 0)).toBe('Ada the ******');
  });

  it('uses the numbered default when a name is masked end to end', () => {
    expect(cleanMemberName('stupid', 1)).toBe('Member 2');
  });

  it('falls back to a numbered default when nothing readable is left', () => {
    expect(cleanMemberName('   ', 2)).toBe('Member 3');
    expect(cleanMemberName('...', 0)).toBe('Member 1');
  });
});
