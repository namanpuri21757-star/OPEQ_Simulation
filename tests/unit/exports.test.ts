/**
 * The exports (SPEC 8.4).
 *
 * Two things matter here and both are tested: the files hold every year and
 * every country with numbers that match what the server stored, and they are
 * shaped so a spreadsheet opens them without mangling anything.
 */

import { describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import { csvDocument, csvField, CSV_BOM } from '../../src/shared/csv.js';
import { debriefFor } from '../../src/shared/debrief.js';
import {
  decisionsCsv,
  EXPORT_FILES,
  exportFile,
  fullJson,
  messagesCsv,
  outcomesCsv,
  reflectionsCsv,
} from '../../src/shared/exports.js';
import { priceNumber, profitNumber, quantityNumber } from '../../src/shared/units.js';
import { addChat, makeSession, setReflection, type Triple } from '../support/session.js';

const SHARE = 383;
const cooperating: Triple = [SHARE, SHARE, SHARE];
const aCheats: Triple = [750, SHARE, SHARE];

/** Splits a CSV into rows, keeping it simple: these files have no newlines in cells. */
function rowsOf(csv: string): string[] {
  return csv.replace(/\r\n$/, '').split('\r\n');
}

function cellsOf(row: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < row.length; i += 1) {
    const char = row[i];
    if (quoted) {
      if (char === '"' && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      out.push(current);
      current = '';
    } else current += char;
  }
  out.push(current);
  return out;
}

/** A game with something in every file. */
function playedSession() {
  const state = makeSession({
    plays: [
      [cooperating, aCheats],
      [cooperating, cooperating],
    ],
    practice: [cooperating, cooperating],
    autos: ['2:C'],
  });
  addChat(state, 1, 'B', 1, 'Shall we all stay low? Yes, "all" of us.');
  // Starts with "=", so the CSV has to hold it as text and not as a formula.
  addChat(state, 1, 'A', 2, '=38.3, and they will never know');
  setReflection(state, 1, 'A', ['Years 1 and 2.', 'We broke one.', 'Talk first.']);
  return state;
}

describe('writing CSV', () => {
  it('quotes a field that holds a comma, a quote or an edge space', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(' padded ')).toBe('" padded "');
  });

  it('stops a spreadsheet reading a cell as a formula', () => {
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('-ouch')).toBe("'-ouch");
    expect(csvField('@name')).toBe("'@name");
  });

  it('ends every row with CRLF, including the last one', () => {
    const csv = csvDocument(['A', 'B'], [['1', '2']]);
    expect(csv).toBe('A,B\r\n1,2\r\n');
  });
});

describe('decisions.csv', () => {
  const state = playedSession();
  const csv = decisionsCsv(state);
  const rows = rowsOf(csv);

  it('starts with a header row that names every unit', () => {
    expect(rows[0]).toContain('Target (million barrels)');
    expect(rows[0]).toContain('Actual output (million barrels)');
    expect(cellsOf(rows[0] ?? '')).toHaveLength(12);
  });

  it('has one row for every world, year and country, practice included', () => {
    // 2 worlds x (1 practice + 2 scored years) x 3 countries.
    expect(rows).toHaveLength(1 + 2 * 3 * 3);
  });

  it('matches what the server stored', () => {
    const world = state.worlds[0];
    const record = world?.years[1];
    const row = rows
      .map(cellsOf)
      .find((cells) => cells[0] === '1' && cells[1] === '2' && cells[4] === 'A');
    expect(row?.[5]).toBe('Ardonia');
    expect(row?.[6]).toBe(quantityNumber(record?.decisions.A.tenths ?? 0));
    expect(row?.[7]).toBe(quantityNumber(record?.outcome.countries.A.actualTenths ?? 0));
  });

  it('marks the decision the server filled in', () => {
    const row = rows
      .map(cellsOf)
      .find((cells) => cells[0] === '1' && cells[1] === '2' && cells[4] === 'C');
    expect(row?.[8]).toBe('yes');
    expect(row?.[9]).toBe('auto');
  });
});

describe('outcomes.csv', () => {
  const state = playedSession();
  const rows = rowsOf(outcomesCsv(state)).map(cellsOf);
  const debrief = debriefFor(state);

  it('has a row for every country in every settled year', () => {
    expect(rows).toHaveLength(1 + 2 * 3 * 3);
  });

  it('matches the stored price and profit exactly', () => {
    for (const world of state.worlds) {
      for (const record of [...(world.practice ? [world.practice] : []), ...world.years]) {
        for (const letter of COUNTRY_LETTERS) {
          const row = rows.find(
            (cells) =>
              cells[0] === String(world.worldNumber) &&
              cells[1] === String(record.year) &&
              cells[3] === (record.isPractice ? 'yes' : 'no') &&
              cells[4] === letter,
          );
          expect(row?.[7]).toBe(priceNumber(record.outcome.priceCents));
          expect(row?.[8]).toBe(profitNumber(record.outcome.countries[letter].profitK));
        }
      }
    }
  });

  it('keeps the practice year out of the cumulative column', () => {
    const practice = rows.find((cells) => cells[1] === '0' && cells[4] === 'A');
    expect(practice?.[9]).toBe(profitNumber(0));
  });

  it('agrees with the debrief about the percent of the cooperative maximum', () => {
    const year = debrief.worlds[0]?.years[1];
    const row = rows.find((cells) => cells[0] === '1' && cells[1] === '2' && cells[4] === 'A');
    expect(row?.[14]).toBe(String(year?.percentOfMax));
  });
});

describe('the other two CSV files', () => {
  const state = playedSession();

  it('lists every message with the year it came before', () => {
    const rows = rowsOf(messagesCsv(state)).map(cellsOf);
    expect(rows).toHaveLength(3);

    // A quote inside a message survives the round trip.
    const quoted = rows.find((cells) => cells[2] === 'B');
    expect(quoted?.slice(0, 4)).toEqual(['1', '1', 'B', 'Borvia']);
    expect(quoted?.[4]).toBe('Shall we all stay low? Yes, "all" of us.');

    // A message starting with "=" is held as text, not as a formula.
    const formula = rows.find((cells) => cells[2] === 'A');
    expect(formula?.[4]).toBe("'=38.3, and they will never know");
  });

  it('puts the three questions in the reflection headings', () => {
    const rows = rowsOf(reflectionsCsv(state));
    expect(rows[0]).toContain('When did your world cooperate best, and why?');
    const cells = cellsOf(rows[1] ?? '');
    expect(cells.slice(0, 4)).toEqual(['1', 'A', 'Ardonia', 'Ada; Ben; Cleo']);
    expect(cells[4]).toBe('Years 1 and 2.');
    expect(rows).toHaveLength(2);
  });
});

describe('the JSON export', () => {
  const state = playedSession();
  const text = fullJson(state);

  it('holds no key and no terminal token', () => {
    expect(text).not.toContain(state.instructorKey);
    expect(text).not.toContain(state.projectorKey);
    expect(text).not.toContain('token-not-in-any-view');
  });

  it('holds every world, year and country, and the debrief', () => {
    const parsed = JSON.parse(text) as {
      worlds: Array<{ worldNumber: number; years: unknown[]; practice: unknown }>;
      debrief: { worlds: Array<{ percentOfMax: number }> };
      settings: { years: number };
    };
    expect(parsed.worlds).toHaveLength(2);
    expect(parsed.worlds[0]?.years).toHaveLength(2);
    expect(parsed.worlds[0]?.practice).not.toBeNull();
    expect(parsed.debrief.worlds).toHaveLength(2);
    expect(parsed.settings.years).toBe(12);
  });

  it('writes timestamps a person can read', () => {
    const parsed = JSON.parse(text) as { session: { createdAt: string } };
    expect(parsed.session.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('the list of files', () => {
  it('offers the four CSV files and the JSON file', () => {
    expect(EXPORT_FILES.map((file) => file.name)).toEqual([
      'decisions',
      'outcomes',
      'messages',
      'reflections',
      'session',
    ]);
    expect(EXPORT_FILES.filter((file) => file.contentType.startsWith('text/csv'))).toHaveLength(4);
  });

  it('builds every file for a game that scored nothing', () => {
    const empty = makeSession({ plays: [[]] });
    for (const file of EXPORT_FILES) {
      const body = file.build(empty);
      expect(body.length).toBeGreaterThan(0);
    }
  });

  it('knows nothing about a name it does not have', () => {
    expect(exportFile('decisions')?.fileName).toBe('decisions.csv');
    expect(exportFile('homework')).toBeUndefined();
  });

  it('has a byte-order mark to offer', () => {
    expect(CSV_BOM).toBe('﻿');
  });
});
