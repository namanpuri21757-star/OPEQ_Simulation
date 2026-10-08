/**
 * Writing CSV that a spreadsheet opens without a fight.
 *
 * The rules, from RFC 4180 and from what Excel actually does:
 *  - rows end with CRLF,
 *  - a field is quoted whenever it holds a comma, a quote, a line break or
 *    leading or trailing spaces, and a quote inside is doubled,
 *  - a field that starts with =, +, - or @ is prefixed with a single quote, so a
 *    spreadsheet shows the text instead of treating it as a formula,
 *  - the file is UTF-8; the server adds a byte-order mark, because without one
 *    Excel on a Windows laptop reads accented letters wrongly.
 *
 * Numbers are written as plain decimals with no currency sign and no thousands
 * separator, because a column a teacher wants to sum has to be a number. The
 * unit is in the column heading instead.
 */

/** Rows end with CRLF, which every spreadsheet reads. */
const ROW_END = '\r\n';

/** Prepended by the server so Excel knows the file is UTF-8. */
export const CSV_BOM = '﻿';

const NEEDS_QUOTES = /[",\r\n]|^\s|\s$/;
/** A leading one of these makes a spreadsheet treat the text as a formula. */
const FORMULA_START = /^[=+\-@]/;

export function csvField(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  if (!NEEDS_QUOTES.test(safe)) return safe;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(fields: readonly string[]): string {
  return fields.map(csvField).join(',');
}

/** A header row plus the rows, ending with one final CRLF. */
export function csvDocument(
  columns: readonly string[],
  rows: ReadonlyArray<readonly string[]>,
): string {
  return [csvRow(columns), ...rows.map(csvRow)].join(ROW_END) + ROW_END;
}

/** A moment as a plain ISO timestamp, so a column of them sorts. */
export function isoTime(at: number): string {
  return new Date(at).toISOString();
}

/** A yes or no a teacher can filter on. */
export function yesNo(value: boolean): string {
  return value ? 'yes' : 'no';
}

