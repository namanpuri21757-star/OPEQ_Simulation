/**
 * The ten debrief questions (SPEC section 10), with this session's own numbers
 * written into them.
 *
 * The wording stays a question: the numbers that go in are the ones a student
 * needs in order to answer (the cooperative share, which year the new producer
 * came, which year was the last), never the answer itself. Each one names the
 * screen that shows the evidence, so a teacher can move from the question to the
 * chart in one click.
 */

import { newProducerTenths } from '../engine/engine.js';
import type { Settings } from '../settings.js';
import { formatQuantity } from '../units.js';
import type { DebriefQuestion, DebriefTheory } from './types.js';

export function questionsFor(settings: Settings, theory: DebriefTheory): DebriefQuestion[] {
  const share = formatQuantity(theory.shareTenths);
  const np = settings.newProducer;

  const newProducerQuestion = np.enabled
    ? `A new producer arrived in Year ${String(np.year)} with ${formatQuantity(newProducerTenths(np.year, settings))} million barrels and the price fell. Did that change how much you trusted the others? Did anyone use it as cover for producing more?`
    : 'No new producer arrived in this game. If one had, how do you think your world would have reacted?';

  const finalYearQuestion = settings.finalYearWarning
    ? `What happened after you were told Year ${String(settings.years)} was the final year, and why?`
    : `You were never told which year was the last. How did not knowing change what you did near the end?`;

  const rows: Array<[number, string, string, DebriefQuestion['evidence'], string]> = [
    [
      1,
      'LG1',
      'Which world came closest to the cooperative maximum, and what did it do differently in Years 1 to 3?',
      'worldComparison',
      'the world comparison',
    ],
    [
      2,
      'LG3',
      "In which year did your world's cooperation break, and what happened just before?",
      'worldDetail',
      'this world year by year',
    ],
    [
      3,
      'LG3',
      'How did your first decision set the tone for the years that followed?',
      'worldDetail',
      'Year 1 in this world',
    ],
    [
      4,
      'LG2',
      'What did your Envoy promise in the messages, and did your group keep it?',
      'worldDetail',
      'the messages and what each country did',
    ],
    [5, 'LG6', newProducerQuestion, 'worldDetail', 'the price and the new producer'],
    [6, 'LG6', finalYearQuestion, 'worldDetail', 'the final year'],
    [
      7,
      'LG4',
      `If the other two countries each produce ${share} million barrels, what is your best output? Why is everyone producing ${share} not stable?`,
      'gameTheory',
      'the best response',
    ],
    [
      8,
      'LG5',
      'In which year did the price move most, and why did it move then?',
      'worldDetail',
      'the price line',
    ],
    [
      9,
      'LG2',
      'How did your group agree on its number each year? Did whoever was at the keyboard have extra influence?',
      'worldDetail',
      'this world year by year',
    ],
    [
      10,
      'Transfer',
      'Where outside this classroom do people face this same dilemma?',
      'gameTheory',
      'the dilemma in numbers',
    ],
  ];

  return rows.map(([number, goal, text, evidence, evidenceLabel]) => ({
    number,
    goal,
    text,
    evidence,
    evidenceLabel,
  }));
}
