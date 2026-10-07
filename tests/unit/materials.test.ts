/**
 * The classroom materials (SPEC 8.4 Materials).
 *
 * The thing worth testing is that they are built from the settings rather than
 * typed out: a teacher who halves the slope has to get a handout that still
 * matches the game. The reading-level check is a blunt instrument, but it does
 * catch the one failure that matters - a sentence nobody in Year 9 will finish.
 */

import { describe, expect, it } from 'vitest';
import {
  agendaMinutes,
  agendaRows,
  markdownFor,
  materialFor,
  materialsFor,
  type MaterialDoc,
} from '../../src/shared/materials/index.js';
import { DEFAULT_SETTINGS, PRESETS, parseSettings } from '../../src/shared/settings.js';

const docs = materialsFor(DEFAULT_SETTINGS);

/** Every sentence in every paragraph, bullet and step. */
function sentencesOf(doc: MaterialDoc): string[] {
  const text: string[] = [doc.intro];
  for (const block of doc.blocks) {
    if (block.kind === 'paragraph' || block.kind === 'note') text.push(block.text);
    if (block.kind === 'bullets' || block.kind === 'steps') text.push(...block.items);
  }
  return text.flatMap((part) => part.split(/(?<=[.?!])\s+/)).filter((part) => part.trim() !== '');
}

describe('the five materials', () => {
  it('are the five SPEC asks for', () => {
    expect(docs.map((doc) => doc.slug)).toEqual([
      'student-briefing',
      'role-cards',
      'instructor-runbook',
      'debrief-guide',
      'privacy-note',
    ]);
  });

  it('each have a title, a one-line intro and some blocks', () => {
    for (const doc of docs) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.intro.length).toBeGreaterThan(0);
      expect(doc.blocks.length).toBeGreaterThan(3);
    }
  });

  it('can be found by slug', () => {
    expect(materialFor(DEFAULT_SETTINGS, 'role-cards')?.title).toBe('Role cards');
    expect(materialFor(DEFAULT_SETTINGS, 'homework')).toBeUndefined();
  });

  it('keep their sentences short enough to read out loud', () => {
    for (const doc of docs) {
      for (const sentence of sentencesOf(doc)) {
        const words = sentence.trim().split(/\s+/).length;
        expect(words, `${doc.slug}: ${sentence}`).toBeLessThanOrEqual(34);
      }
    }
  });
});

describe('the student briefing', () => {
  it('works its example out from the settings', () => {
    const doc = materialFor(DEFAULT_SETTINGS, 'student-briefing');
    const text = markdownFor(doc!);
    expect(text).toContain('price = 70 - 0.3 x total supply');
    expect(text).toContain('price = 70 - 0.3 x 120.0 = $34.00');
    expect(text).toContain('profit = ($34.00 - $1.00) x 40.0 = $1,320.00M');
  });

  it('follows the settings when a teacher changes them', () => {
    const settings = parseSettings({ a: 50, b: 0.5, cost: 2, startingOutput: 20, capacity: 40 });
    const text = markdownFor(materialFor(settings, 'student-briefing')!);
    expect(text).toContain('price = 50 - 0.5 x total supply');
    expect(text).toContain('price = 50 - 0.5 x 60.0 = $20.00');
    expect(text).toContain('profit = ($20.00 - $2.00) x 20.0 = $360.00M');
    expect(text).toContain('Your capacity is 40.0 million barrels');
  });

  it('counts the chat windows and summits the class will really get', () => {
    const text = markdownFor(materialFor(DEFAULT_SETTINGS, 'student-briefing')!);
    expect(text).toContain('There are 2 chat windows and 1 face-to-face summit');

    const quiet = markdownFor(materialFor(PRESETS['short-50'], 'student-briefing')!);
    expect(quiet).toContain('There is 1 chat window and 0 face-to-face summits');
  });

  it('says nothing about the best response', () => {
    const text = markdownFor(materialFor(DEFAULT_SETTINGS, 'student-briefing')!);
    expect(text.toLowerCase()).not.toContain('best response');
    // 57.5 is the competitive outcome and 38.3 the cooperative share: neither
    // belongs on a page students read before they play (SPEC section 3).
    expect(text).not.toContain('57.5');
    expect(text).not.toContain('38.3 each');
  });
});

describe('the agenda', () => {
  it('fits each preset into about the lesson it is named for', () => {
    expect(agendaMinutes(PRESETS['short-50'])).toBeGreaterThan(35);
    expect(agendaMinutes(PRESETS['short-50'])).toBeLessThanOrEqual(50);
    expect(agendaMinutes(PRESETS['standard-75'])).toBeGreaterThan(55);
    expect(agendaMinutes(PRESETS['standard-75'])).toBeLessThanOrEqual(75);
    expect(agendaMinutes(PRESETS['long-90'])).toBeGreaterThan(70);
    expect(agendaMinutes(PRESETS['long-90'])).toBeLessThanOrEqual(90);
  });

  it('puts every activity and the final-year warning in their places', () => {
    const stages = agendaRows(PRESETS['standard-75']).map((row) => row.stage);
    expect(stages).toEqual([
      'Welcome and briefing',
      'Practice year',
      'Years 1 to 3',
      'Chat window after Year 3',
      'Years 4 to 7',
      'Summit after Year 7',
      'Years 8 to 10',
      'Chat window after Year 10',
      'Year 11',
      'Final-year warning',
      'Year 12',
      'Debrief',
    ]);
  });

  it('leaves the warning out when it is turned off', () => {
    const settings = parseSettings({
      years: 4,
      schedule: [],
      newProducer: { enabled: false },
      finalYearWarning: false,
    });
    expect(agendaRows(settings).map((row) => row.stage)).toEqual([
      'Welcome and briefing',
      'Practice year',
      'Years 1 to 4',
      'Debrief',
    ]);
  });

  it('never shows a stage as taking no time', () => {
    for (const preset of Object.values(PRESETS)) {
      for (const row of agendaRows(preset)) expect(row.minutes).toBeGreaterThan(0);
    }
  });
});

describe('the debrief guide', () => {
  const text = markdownFor(materialFor(DEFAULT_SETTINGS, 'debrief-guide')!);

  it('lists the ten questions', () => {
    for (let number = 1; number <= 10; number += 1) {
      expect(text).toContain(`| ${String(number)} |`);
    }
  });

  it('carries an answer key worked out by the engine', () => {
    expect(text).toContain('38.3');
    expect(text).toContain('$3,967.50M');
    expect(text).toContain('57.5');
    expect(text).toContain('$18.25');
  });

  it('names every learning goal', () => {
    for (const goal of ['LG1', 'LG2', 'LG3', 'LG4', 'LG5', 'LG6']) {
      expect(text).toContain(goal);
    }
  });
});

describe('the privacy note', () => {
  const text = markdownFor(materialFor(DEFAULT_SETTINGS, 'privacy-note')!);

  it('says what is collected, where it sits and how to delete it', () => {
    expect(text).toContain('First names only');
    expect(text).toContain('nowhere else');
    expect(text).toContain('DELETE');
  });
});

describe('the Markdown a material turns into', () => {
  it('writes one construct per block', () => {
    const doc: MaterialDoc = {
      slug: 'demo',
      title: 'Demo',
      intro: 'A line.',
      blocks: [
        { kind: 'heading', text: 'One' },
        { kind: 'subheading', text: 'Two' },
        { kind: 'paragraph', text: 'Words.' },
        { kind: 'bullets', items: ['a', 'b'] },
        { kind: 'steps', items: ['first', 'second'] },
        { kind: 'note', text: 'Careful.' },
        { kind: 'formula', text: 'p = 1' },
        { kind: 'table', caption: 'Cap', columns: ['x', 'y'], rows: [['1', 'a|b']] },
      ],
    };
    const text = markdownFor(doc);
    expect(text).toContain('# Demo');
    expect(text).toContain('## One');
    expect(text).toContain('### Two');
    expect(text).toContain('- a\n- b');
    expect(text).toContain('1. first\n2. second');
    expect(text).toContain('> Careful.');
    expect(text).toContain('    p = 1');
    // A pipe inside a cell is escaped, or it would end the column early.
    expect(text).toContain('| 1 | a\\|b |');
    expect(text.endsWith('\n')).toBe(true);
  });
});
