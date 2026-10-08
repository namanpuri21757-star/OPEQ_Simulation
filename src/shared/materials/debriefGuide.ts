/**
 * debrief-guide.md: what to do with the twenty minutes after the last year
 * (SPEC section 10 and 8.4 Materials).
 *
 * The answer key at the end is generated from the engine for the standard
 * settings, so it cannot drift away from the game. The patterns are the part a
 * teacher cannot read off a chart: what classes usually do, and what to say when
 * they do it.
 */

import { questionsFor, theoryFor, type DebriefTheory } from '../debrief.js';
import { economicUnits, type Settings } from '../settings.js';
import { formatPrice, formatProfitK, formatQuantity } from '../units.js';
import type { MaterialBlock, MaterialDoc } from './types.js';

/** The learning goals this lesson is for (SPEC section 1). */
const GOALS: Array<[string, string]> = [
  ['LG1', 'Feel the pull between what is best for you and what is best for the three of you.'],
  ['LG2', 'Practise making, keeping and breaking promises, and see what credibility costs.'],
  [
    'LG3',
    'Watch trust get built, broken and sometimes repaired, and notice how early moves set the tone.',
  ],
  ['LG4', 'Meet best response, the competitive outcome and the cooperative outcome.'],
  ['LG5', 'See the price and the profit move with total supply.'],
  ['LG6', 'Notice how openness, a surprise new producer and a known final year change behaviour.'],
];

function answerKeyBlocks(settings: Settings, theory: DebriefTheory): MaterialBlock[] {
  const u = economicUnits(settings);
  return [
    { kind: 'heading', text: 'Answer key' },
    {
      kind: 'paragraph',
      text: `For the standard settings, in Year ${String(theory.year)}, before any new producer arrives. These are for you, not for the room, until the debrief.`,
    },
    {
      kind: 'table',
      caption: 'The two benchmarks',
      columns: [
        'Outcome',
        'Each country',
        'Total supply',
        'Price',
        'Each country earns',
        'All three earn',
      ],
      rows: [
        [
          'Everyone cooperates',
          formatQuantity(theory.shareTenths),
          formatQuantity(theory.shareTenths * 3),
          formatPrice(theory.cooperativePriceCents),
          formatProfitK(theory.cooperativeEachProfitK),
          formatProfitK(theory.cooperativeEachProfitK * 3),
        ],
        [
          'Everyone competes',
          formatQuantity(theory.competitiveEachTenths),
          formatQuantity(theory.competitiveTotalTenths),
          formatPrice(theory.competitivePriceCents),
          formatProfitK(theory.competitiveEachProfitK),
          formatProfitK(theory.competitiveEachProfitK * 3),
        ],
      ],
    },
    {
      kind: 'paragraph',
      text: `The best the three can do together is ${formatProfitK(theory.cooperativeMaxK)} a year, at a total of ${formatQuantity(theory.cooperativeTotalTenths)} million barrels. The debrief scores every world against that number.`,
    },
    { kind: 'subheading', text: 'Why the agreement is unstable' },
    {
      kind: 'paragraph',
      text: `If the other two each produce ${formatQuantity(theory.shareTenths)}, your best answer is ${formatQuantity(theory.bestResponseTenths)}${theory.bestResponseTenths === theory.bestResponseRawTenths ? '' : ` (the formula asks for ${formatQuantity(theory.bestResponseRawTenths)}, but capacity is ${formatQuantity(u.capacityTenths)})`}.`,
    },
    { kind: 'formula', text: 'your best output = (a - cost - b x everyone else) / (2 x b)' },
    {
      kind: 'paragraph',
      text: `Doing it earns you ${formatProfitK(theory.gainFromCheatingK)} more than cooperating, and costs each of the other two ${formatProfitK(theory.lossPerCooperatorK)}. All three countries can see that same arithmetic, so all three are tempted at once. That is the whole dilemma.`,
    },
  ];
}

export function debriefGuideDoc(settings: Settings): MaterialDoc {
  // No class has played yet, so the benchmarks are worked out with no worlds.
  // The questions come from the settings either way.
  const theory = theoryFor(settings, []);
  const questions = questionsFor(settings, theory);

  return {
    slug: 'debrief-guide',
    title: 'Debrief guide',
    intro: 'What to ask after the last year, what classes usually do, and the numbers behind it.',
    blocks: [
      { kind: 'heading', text: 'What the lesson is for' },
      {
        kind: 'table',
        caption: 'Learning goals',
        columns: ['Goal', 'What students should come away with'],
        rows: GOALS,
      },

      { kind: 'heading', text: 'How to run the debrief' },
      {
        kind: 'steps',
        items: [
          'End the game, then press **Reveal results to teams** so groups can see the other worlds.',
          'Start with **World Comparison** on the projector. Ask the room what they notice before you say anything.',
          'Open **World Detail** for the world that held together longest, then for one that did not. Point at the year cooperation broke and ask what happened just before it.',
          'Show the **Leaderboard** only after that conversation. Otherwise the room talks about winning rather than about why the money went to buyers.',
          'Finish with **Game theory**, using the class’s own numbers, and then the ten questions.',
        ],
      },
      {
        kind: 'note',
        text: 'Use neutral words. No world lost. A world that competed hard made less money and learned the lesson the hard way, which is worth saying out loud.',
      },

      { kind: 'heading', text: 'The ten questions' },
      {
        kind: 'table',
        caption: 'Questions, and where the evidence is',
        columns: ['#', 'Question', 'Goal', 'Where to look'],
        rows: questions.map((question) => [
          String(question.number),
          question.text,
          question.goal,
          question.evidenceLabel,
        ]),
      },

      { kind: 'heading', text: 'Patterns you will probably see' },
      {
        kind: 'bullets',
        items: [
          'Year 1 is usually near the starting number, because nobody has a reason to move yet. Whatever happens in Years 2 and 3 tends to set the tone for the rest.',
          'A world that talks in numbers in its first chat window usually keeps more of the cooperative maximum than a world that talks in promises without numbers.',
          'One country going to capacity once is often enough to end an agreement for good, even if it goes back down afterwards.',
          `The new producer's barrels look exactly like cheating from inside a world. Expect at least one group to accuse another of something nobody did, and ask them how they would have told the difference.`,
          'After the final-year warning most worlds produce more. Ask why a promise is worth less when there is no next year.',
          'Groups almost always expect the others to produce less than they really do. Ask each world what it assumed, then show the table.',
        ],
      },

      ...answerKeyBlocks(settings, theory),

      { kind: 'heading', text: 'If you have five minutes left' },
      {
        kind: 'bullets',
        items: [
          'Ask where else people face this: queueing, group projects, fishing quotas, revising together, keeping a shared kitchen clean.',
          'Ask what rule they would add to make cooperation hold, and what it would cost.',
          `Ask whether they would have behaved differently if the game had run for forty years instead of ${String(settings.years)}.`,
        ],
      },
    ],
  };
}
