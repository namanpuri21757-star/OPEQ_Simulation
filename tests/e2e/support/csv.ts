/**
 * Reading a downloaded CSV back, the way a spreadsheet would.
 *
 * The app only ever writes CSV, so there is nothing to read it with in src/.
 * This is a reader for the test alone: it handles the three things the writer
 * produces - a byte-order mark, CRLF line endings, and quoted fields with
 * doubled quotes inside them - and nothing else.
 *
 * The mark itself comes from src/shared/csv.ts, so the reader and the writer
 * cannot disagree about what they are looking for.
 */

import { CSV_BOM } from '../../../src/shared/csv.js';

export interface CsvTable {
  header: string[];
  rows: string[][];
  /** The value of one column in one row, by column name. */
  cell(row: string[], column: string): string;
}

export function parseCsv(text: string): CsvTable {
  const body = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];

    if (quoted) {
      if (char === '"') {
        if (body[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // Part of CRLF; the \n below ends the row.
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows[0] ?? [];
  const width = header.length;
  return {
    header,
    rows: rows.slice(1).filter((candidate) => candidate.length === width),
    cell(candidate, column) {
      const index = header.indexOf(column);
      if (index < 0) throw new Error(`There is no column called "${column}" in this file.`);
      return candidate[index] ?? '';
    },
  };
}
