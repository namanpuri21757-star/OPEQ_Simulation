/**
 * student-briefing.md: the one page every group reads before Year 1.
 *
 * Every number in it comes from the session's own settings, so a teacher who
 * changes the price line still hands out a page that is true (SPEC 8.3).
 */

import { COUNTRY_LETTERS, COUNTRY_NAMES } from '../constants.js';
import { priceCents, profitK } from '../engine/engine.js';
import { economicUnits, secondsForYear, type Settings } from '../settings.js';
import { formatPrice, formatProfitK, formatQuantity } from '../units.js';
import type { MaterialDoc } from './types.js';

export function briefingDoc(settings: Settings): MaterialDoc {
  const u = economicUnits(settings);
  const exampleEach = u.startingOutputTenths;
  const exampleTotal = exampleEach * 3;
  const examplePrice = priceCents(exampleTotal, u.aCents, u.bHundredths);
  const exampleProfit = profitK(examplePrice, u.costCents, exampleEach);

  const summits = settings.schedule.filter((item) => item.kind === 'summit').length;
  const when =
    summits === 0
      ? 'Your teacher turns messaging on and off. Your screen always says which it is.'
      : `Your teacher turns messaging on and off, and your screen always says which it is. There ${summits === 1 ? 'is' : 'are'} also ${String(summits)} face-to-face ${summits === 1 ? 'summit' : 'summits'}, where the Envoys meet in the room.`;

  const priceRow = (totalTenths: number): string[] => [
    formatQuantity(totalTenths),
    formatPrice(priceCents(totalTenths, u.aCents, u.bHundredths)),
  ];

  return {
    slug: 'student-briefing',
    title: 'Your country, your oil, your call',
    intro: 'One page for every group. Read it before the practice year starts.',
    blocks: [
      { kind: 'heading', text: 'The story' },
      {
        kind: 'paragraph',
        text: `You run the Oil Production Board of one country. Three countries share one world market: ${COUNTRY_LETTERS.map((letter) => `${COUNTRY_NAMES[letter]} (${letter})`).join(', ')}. Every year each country decides how many million barrels to produce. Your job is to earn as much money as you can for your own country over the whole game.`,
      },
      {
        kind: 'paragraph',
        text: 'Nobody sets the price. The price comes from how much oil the three of you produce in total. The more oil there is, the less each barrel is worth. That is the whole puzzle: you want to sell a lot, but you also want the price to stay high.',
      },

      { kind: 'heading', text: 'How the price works' },
      { kind: 'formula', text: `price = ${settings.a} - ${settings.b} x total supply` },
      {
        kind: 'paragraph',
        text: `Total supply is the three countries added together, in millions of barrels a year. Every extra million barrels anyone produces pushes the price down by ${formatPrice(u.bHundredths)} for everybody, including the country that produced it. The price never goes below ${formatPrice(0)}.`,
      },
      {
        kind: 'table',
        caption: 'Some totals and the price they give',
        columns: ['Total supply', 'Price'],
        rows: [
          priceRow(0),
          priceRow(exampleTotal),
          priceRow(u.capacityTenths * 2),
          priceRow(u.capacityTenths * 3),
        ],
      },
      { kind: 'subheading', text: 'A worked example' },
      {
        kind: 'paragraph',
        text: `Say the world produces ${formatQuantity(exampleTotal)} million barrels.`,
      },
      {
        kind: 'formula',
        text: `price = ${settings.a} - ${settings.b} x ${formatQuantity(exampleTotal)} = ${formatPrice(examplePrice)}`,
      },
      {
        kind: 'paragraph',
        text: `Each barrel costs ${formatPrice(u.costCents)} to lift out of the ground. Profit is what is left, times your own output. So if you produced ${formatQuantity(exampleEach)} million barrels:`,
      },
      {
        kind: 'formula',
        text: `profit = (${formatPrice(examplePrice)} - ${formatPrice(u.costCents)}) x ${formatQuantity(exampleEach)} = ${formatProfitK(exampleProfit)}`,
      },
      {
        kind: 'note',
        text: `Your capacity is ${formatQuantity(u.capacityTenths)} million barrels a year. You can produce any amount from 0 up to that, with one decimal place, like ${formatQuantity(383)}.`,
      },

      { kind: 'heading', text: 'Your two jobs' },
      {
        kind: 'bullets',
        items: [
          'Operator: sits at the keyboard and types the number in. Nobody else touches it.',
          'Envoy: writes the messages and goes to the summit.',
        ],
      },
      {
        kind: 'paragraph',
        text: `The jobs swap every ${String(settings.rotateEvery)} years, so everyone gets a turn. Your screen always says who has which job right now.`,
      },

      { kind: 'heading', text: 'How a year works' },
      {
        kind: 'steps',
        items: [
          'Your teacher opens the year and a timer starts.',
          'Talk it over as a group and agree on a number.',
          'The Operator types your number and presses Submit. You can change it until the timer ends.',
          'The year closes. Everyone sees the price, and you see your own profit and your total so far.',
        ],
      },
      {
        kind: 'paragraph',
        text: `A practice year comes first and does not count. Year 1 onwards does. The practice year gives you ${String(secondsForYear(0, settings))} seconds, and a normal year about ${String(secondsForYear(1, settings))}.`,
      },
      {
        kind: 'note',
        text: 'If you send nothing, your country repeats last year’s number and the screen marks it as filled in for you. It is always better to decide.',
      },

      { kind: 'heading', text: 'Talking to the other countries' },
      {
        kind: 'bullets',
        items: [
          when,
          'Your messages go to the other two countries in your world only, and they show your country name, never your own name.',
          `You can promise anything you like in a message, for example "We will produce ${formatQuantity(exampleEach)} million barrels". The others can see what you really produced afterwards.`,
        ],
      },
      {
        kind: 'paragraph',
        text: 'A promise is not a rule. Nobody can stop you breaking one, and nobody can stop the others. What happens next is up to all three of you.',
      },
    ],
  };
}
