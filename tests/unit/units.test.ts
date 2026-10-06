/**
 * Reading what a student types, and writing numbers back out.
 *
 * The messages matter as much as the numbers here: a team has a timer running
 * and has to be able to fix the problem from the message alone.
 */

import { describe, expect, it } from 'vitest';
import {
  formatMillions,
  formatPrice,
  formatProfitK,
  formatQuantity,
  parseQuantity,
  priceNumber,
  profitNumber,
  quantityNumber,
} from '@shared/units.js';
import {
  ceilDiv,
  clamp,
  decimalPlaces,
  floorDiv,
  roundDiv,
  roundHalfAwayFromZero,
  toCents,
  toHundredths,
  toTenths,
} from '@shared/engine/integers.js';

const CAPACITY = 750; // 75.0 million barrels

function tenthsOf(text: string): number {
  const result = parseQuantity(text, CAPACITY);
  if (!result.ok) throw new Error(`expected ${text} to parse, got: ${result.message}`);
  return result.tenths;
}

function messageFor(text: string): string {
  const result = parseQuantity(text, CAPACITY);
  if (result.ok) throw new Error(`expected ${text} to be rejected, got ${result.tenths}`);
  return result.message;
}

describe('parseQuantity accepts', () => {
  it.each([
    ['0', 0],
    ['38', 380],
    ['38.3', 383],
    ['38.30', 383],
    ['38,3', 383],
    ['38.0', 380],
    ['75', 750],
    ['75.0', 750],
    ['  38.3  ', 383],
    ['+38.3', 383],
    ['00038.300', 383],
  ])('%s as %i tenths', (text, tenths) => {
    expect(tenthsOf(text)).toBe(tenths);
  });
});

describe('parseQuantity rejects', () => {
  it('an empty box, and says what to type', () => {
    expect(messageFor('')).toBe('Type how many million barrels you want to produce, like 38.3.');
    expect(messageFor('   ')).toBe(messageFor(''));
  });

  it('letters', () => {
    expect(messageFor('abc')).toBe('That is not a number. Type digits only, like 38.3.');
    expect(messageFor('38 million')).toBe(messageFor('abc'));
    expect(messageFor('3e2')).toBe(messageFor('abc'));
    expect(messageFor('.5')).toBe(messageFor('abc'));
    expect(messageFor('38.')).toBe(messageFor('abc'));
    expect(messageFor('3,8,3')).toBe(messageFor('abc'));
  });

  it('a negative number, without calling it "not a number"', () => {
    expect(messageFor('-1')).toBe('Production cannot be less than 0. Type 0 or more.');
    expect(messageFor('-38.3')).toBe(messageFor('-1'));
  });

  it('more than one meaningful decimal place', () => {
    expect(messageFor('38.35')).toBe(
      'Only one decimal place is allowed. Try 38.3 or 38.4 instead of 38.35.',
    );
    expect(messageFor('38,35')).toBe(messageFor('38.35'));
    // A trailing zero carries no information, so 38.30 is fine but 38.35 is not.
    expect(tenthsOf('38.300')).toBe(383);
  });

  it('anything above capacity, and names the capacity', () => {
    expect(messageFor('75.1')).toBe('Your capacity is 75.0 million barrels, so 75.1 is too high.');
    expect(messageFor('1000')).toBe(
      'Your capacity is 75.0 million barrels, so 1,000.0 is too high.',
    );
  });

  it('a different capacity in the message', () => {
    const result = parseQuantity('50.1', 500);
    expect(result).toEqual({
      ok: false,
      message: 'Your capacity is 50.0 million barrels, so 50.1 is too high.',
    });
  });
});

describe('formatQuantity', () => {
  it.each([
    [383, '38.3'],
    [750, '75.0'],
    [0, '0.0'],
    [150, '15.0'],
    [1, '0.1'],
    [12345, '1,234.5'],
    [-45, '-4.5'],
  ])('%i gives %s', (tenths, text) => {
    expect(formatQuantity(tenths)).toBe(text);
  });
});

describe('formatPrice', () => {
  it.each([
    [3400, '$34.00'],
    [3553, '$35.53'],
    [1825, '$18.25'],
    [0, '$0.00'],
    [7000, '$70.00'],
    [5, '$0.05'],
    [123456, '$1,234.56'],
    [-450, '-$4.50'],
  ])('%i gives %s', (cents, text) => {
    expect(formatPrice(cents)).toBe(text);
  });
});

describe('formatProfitK rounds half away from zero', () => {
  it.each([
    [1_320_000, '$1,320.00M'],
    [991_875, '$991.88M'],
    [-75_000, '-$75.00M'],
    [1_322_499, '$1,322.50M'],
    [900_816, '$900.82M'],
    [0, '$0.00M'],
    [-991_875, '-$991.88M'],
    [5, '$0.01M'],
    [-5, '-$0.01M'],
    [4, '$0.00M'],
    [3_967_500, '$3,967.50M'],
  ])('%i gives %s', (profitK, text) => {
    expect(formatProfitK(profitK)).toBe(text);
  });

  it('drops the dollar and the M for a table cell that has them in its header', () => {
    expect(formatMillions(3_967_500)).toBe('3,967.50');
    expect(formatMillions(-75_000)).toBe('-75.00');
  });
});

describe('plain numbers for a spreadsheet column', () => {
  it('writes quantities, prices and profits without any grouping', () => {
    expect(quantityNumber(383)).toBe('38.3');
    expect(quantityNumber(1200)).toBe('120.0');
    expect(priceNumber(3553)).toBe('35.53');
    expect(priceNumber(0)).toBe('0.00');
    expect(profitNumber(1_322_499)).toBe('1322.499');
    expect(profitNumber(-75_000)).toBe('-75.000');
  });
});

describe('integer helpers', () => {
  it('rounds half away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
    expect(roundHalfAwayFromZero(0)).toBe(0);
  });

  it('divides with the same rule', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(34470, 10)).toBe(3447);
    expect(floorDiv(5, 2)).toBe(2);
    expect(ceilDiv(5, 2)).toBe(3);
    expect(floorDiv(-5, 2)).toBe(-3);
    expect(ceilDiv(-5, 2)).toBe(-2);
  });

  it('clamps', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('counts decimal places, and rejects exponent notation', () => {
    expect(decimalPlaces(70)).toBe(0);
    expect(decimalPlaces(0.3)).toBe(1);
    expect(decimalPlaces(70.25)).toBe(2);
    expect(decimalPlaces(38.35)).toBe(2);
    expect(decimalPlaces(1e-7)).toBe(99);
  });

  it('converts to whole units', () => {
    expect(toCents(70)).toBe(7000);
    expect(toCents(1)).toBe(100);
    expect(toCents(-10)).toBe(-1000);
    expect(toHundredths(0.3)).toBe(30);
    expect(toTenths(38.3)).toBe(383);
    expect(toTenths(75)).toBe(750);
  });
});
