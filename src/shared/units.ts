/**
 * Turning what a student types into whole units, and whole units back into text.
 *
 * Every number the game stores is a whole unit (SPEC section 3): quantities in
 * tenths of a million barrels, prices in cents, profits in thousands of dollars.
 * This file is the only place that crosses between those units and human text,
 * so a price looks the same on a terminal, a projector and in an export.
 */

import { roundDiv } from './engine/integers.js';

/** parseQuantity either gives whole tenths or a message a student can act on. */
export type QuantityParse = { ok: true; tenths: number } | { ok: false; message: string };

/** Accepts 38, 38.3, 38.30 and 38,3. A comma is a decimal point in many countries. */
const NUMBER_SHAPE = /^(\d+)(?:\.(\d+))?$/;

/**
 * Reads a typed production number.
 *
 * The messages name the problem and show a good example, because the student
 * who sees them is in a hurry with a timer running.
 */
export function parseQuantity(text: string, capacityTenths: number): QuantityParse {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') {
    return { ok: false, message: 'Type how many million barrels you want to produce, like 38.3.' };
  }

  // Negatives get their own message, otherwise "that is not a number" would be
  // confusing for someone who typed a perfectly good number with a minus sign.
  if (trimmed.startsWith('-')) {
    return { ok: false, message: 'Production cannot be less than 0. Type 0 or more.' };
  }

  const cleaned = trimmed.replace(',', '.').replace(/^\+/, '');
  const parts = NUMBER_SHAPE.exec(cleaned);
  if (!parts) {
    return { ok: false, message: 'That is not a number. Type digits only, like 38.3.' };
  }

  const whole = parts[1] ?? '';
  // Trailing zeros carry no information, so 38.30 counts as one decimal place.
  const fraction = (parts[2] ?? '').replace(/0+$/, '');
  if (fraction.length > 1) {
    return {
      ok: false,
      message: 'Only one decimal place is allowed. Try 38.3 or 38.4 instead of 38.35.',
    };
  }

  const tenths = Number(whole) * 10 + Number(fraction === '' ? 0 : fraction);
  if (tenths > capacityTenths) {
    return {
      ok: false,
      message: `Your capacity is ${formatQuantity(capacityTenths)} million barrels, so ${formatQuantity(tenths)} is too high.`,
    };
  }

  return { ok: true, tenths };
}

/** 383 becomes "38.3". Always one decimal place, so columns line up. */
export function formatQuantity(tenths: number): string {
  const sign = tenths < 0 ? '-' : '';
  const size = Math.abs(tenths);
  return `${sign}${groupDigits(Math.floor(size / 10))}.${size % 10}`;
}

/** 3400 becomes "$34.00". */
export function formatPrice(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const size = Math.abs(cents);
  return `${sign}$${groupDigits(Math.floor(size / 100))}.${pad2(size % 100)}`;
}

/**
 * Thousands of dollars become millions with 2 decimals: 1320000 gives
 * "$1,320.00M" and -75000 gives "-$75.00M".
 *
 * The minus sign goes before the dollar sign because that is how a student
 * reads it out loud: "minus seventy-five million".
 */
export function formatProfitK(profitK: number): string {
  const sign = profitK < 0 ? '-' : '';
  // 1 thousand dollars is 0.001 million, so 2 decimals of a million means
  // rounding away one digit of thousands.
  const hundredthsOfMillion = roundDiv(Math.abs(profitK), 10);
  const whole = Math.floor(hundredthsOfMillion / 100);
  return `${sign}$${groupDigits(whole)}.${pad2(hundredthsOfMillion % 100)}M`;
}

/** Millions of dollars as a plain number with 2 decimals: "3,967.50". */
export function formatMillions(profitK: number): string {
  return formatProfitK(profitK).replace(/[$M]/g, '');
}

/** A quantity as a plain number for a spreadsheet column: 383 gives "38.3". */
export function quantityNumber(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/** A price as a plain number for a spreadsheet column: 3400 gives "34.00". */
export function priceNumber(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Millions of dollars as a plain number for a spreadsheet column. */
export function profitNumber(profitK: number): string {
  return (profitK / 1000).toFixed(3);
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/**
 * 1320 becomes "1,320". Written by hand rather than with toLocaleString because
 * the grouping must not change with the computer's language settings.
 */
function groupDigits(value: number): string {
  const digits = String(value);
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    const fromEnd = digits.length - i;
    out += digits[i];
    if (fromEnd > 1 && fromEnd % 3 === 1) out += ',';
  }
  return out;
}
