/**
 * Builds docs/ECONOMICS.md.
 *
 * Every number in the page is produced by the engine here and interpolated, so
 * the explanation a teacher hands out can never disagree with the game.
 */

import { PRESETS, economicUnits } from '../../src/shared/settings.js';
import {
  bestResponseRawTenths,
  bestResponseTenths,
  competitiveOutcome,
  cooperativeMax,
  priceCents,
  profitK,
} from '../../src/shared/engine/engine.js';
import { formatPrice, formatProfitK, formatQuantity } from '../../src/shared/units.js';
import { GENERATED_NOTE } from './answer-key.js';
import { outcomeFor, type Triple } from './scenarios.js';

export function economicsDocument(): string {
  const settings = PRESETS['standard-75'];
  const u = economicUnits(settings);
  const year = 1;

  const price = (totalTenths: number) => priceCents(totalTenths, u.aCents, u.bHundredths);
  const coop = cooperativeMax(settings, year);
  const nash = competitiveOutcome(settings, year);

  const share = coop.shareTenths;
  const cooperating: Triple = [share, share, share];
  const competing: Triple = [nash.eachTenths, nash.eachTenths, nash.eachTenths];
  const cheatQ = bestResponseTenths(share * 2, settings);
  const cheating: Triple = [cheatQ, share, share];

  const allCoop = outcomeFor(settings, year, cooperating);
  const allNash = outcomeFor(settings, year, competing);
  const oneCheats = outcomeFor(settings, year, cheating);

  const cheaterGain = oneCheats.countries.A.profitK - allCoop.countries.A.profitK;
  const victimLoss = allCoop.countries.B.profitK - oneCheats.countries.B.profitK;
  const jointCoop =
    allCoop.countries.A.profitK + allCoop.countries.B.profitK + allCoop.countries.C.profitK;
  const jointCheat =
    oneCheats.countries.A.profitK + oneCheats.countries.B.profitK + oneCheats.countries.C.profitK;

  // A worked example at the number SPEC section 8.3 uses in the briefing.
  const exampleTotal = 1200;
  const exampleOwn = 400;
  const examplePrice = price(exampleTotal);

  const supplyRows = [0, share * 3, 1200, coop.totalTenths, nash.totalTenths, u.capacityTenths * 3]
    .filter((v, i, all) => all.indexOf(v) === i)
    .sort((x, y) => x - y);

  const brRows = [0, share * 2, nash.eachTenths * 2, u.capacityTenths * 2].filter(
    (v, i, all) => all.indexOf(v) === i,
  );

  const lines: string[] = [
    '# How the money works',
    '',
    GENERATED_NOTE,
    '',
    'This page explains the whole economy of Crude Accord in plain language.',
    'It uses the standard setup; if your instructor changes the settings, the',
    'shape of every rule stays the same and only the numbers move.',
    '',
    '## 1. The price rule',
    '',
    'Three countries sell into one world market. Nobody sets the price. The price',
    'comes from how much oil the world produces in total:',
    '',
    `    price = ${settings.a} - ${settings.b} x total supply     (never below $0.00)`,
    '',
    'Total supply is the three countries added together, in millions of barrels a',
    'year. So every extra million barrels anyone produces pushes the price down by',
    `${formatPrice(u.bHundredths)} for everybody, including the country that produced it.`,
    '',
    '| Total supply | Price |',
    '| --- | --- |',
    ...supplyRows.map((t) => `| ${formatQuantity(t)} | ${formatPrice(price(t))} |`),
    '',
    `Worked example: if the world produces ${formatQuantity(exampleTotal)} million barrels, the price is`,
    `${settings.a} - ${settings.b} x ${formatQuantity(exampleTotal)} = ${formatPrice(examplePrice)}.`,
    '',
    '## 2. Profit',
    '',
    'Each barrel costs money to lift out of the ground. Profit is what is left:',
    '',
    '    profit = (price - cost) x your own output',
    '',
    `Cost is ${formatPrice(u.costCents)} a barrel. So in the example above, a country that produced`,
    `${formatQuantity(exampleOwn)} million barrels earns (${formatPrice(examplePrice)} - ${formatPrice(u.costCents)}) x ${formatQuantity(exampleOwn)} = ${formatProfitK(profitK(examplePrice, u.costCents, exampleOwn))}.`,
    '',
    'Two things pull against each other here, and they are the whole game:',
    '',
    '- Producing more means you sell more barrels, which lifts your profit.',
    '- Producing more also pushes the price down for all three countries, which',
    '  lowers your profit and theirs at the same time.',
    '',
    `Profit can be negative. If total supply is high enough that the price falls below ${formatPrice(u.costCents)},`,
    'every barrel loses money.',
    '',
    '## 3. Why cooperating helps the group',
    '',
    'There is a total supply that makes the three countries the most money',
    'together. Produce less than that and you are leaving money on the table;',
    'produce more and the falling price costs the group more than the extra',
    'barrels bring in.',
    '',
    `That best joint total is ${formatQuantity(coop.totalTenths)} million barrels. At that total the price is`,
    `${formatPrice(coop.priceCents)} and the three countries make ${formatProfitK(coop.jointMaxK)} between them.`,
    '',
    `Split evenly that is about ${formatQuantity(coop.shareTenths)} each. Three countries each producing`,
    `${formatQuantity(coop.shareTenths)} give a total of ${formatQuantity(allCoop.totalTenths)}, a price of ${formatPrice(allCoop.priceCents)}, and`,
    `${formatProfitK(allCoop.countries.A.profitK)} each.`,
    '',
    '## 4. Why cheating tempts each country',
    '',
    `Suppose the other two keep their promise and produce ${formatQuantity(share)} each, and you do not.`,
    `Your best move is to produce ${formatQuantity(cheatQ)}. Then:`,
    '',
    '| Country | Output | Profit | Change from cooperating |',
    '| --- | --- | --- | --- |',
    `| The one that cheated | ${formatQuantity(oneCheats.countries.A.actualTenths)} | ${formatProfitK(oneCheats.countries.A.profitK)} | ${signed(cheaterGain)} |`,
    `| Each one that kept cooperating | ${formatQuantity(oneCheats.countries.B.actualTenths)} | ${formatProfitK(oneCheats.countries.B.profitK)} | ${signed(-victimLoss)} |`,
    `| All three together | ${formatQuantity(oneCheats.totalTenths)} | ${formatProfitK(jointCheat)} | ${signed(jointCheat - jointCoop)} |`,
    '',
    'Read that table twice. The cheater gains and the group loses. That is what',
    'makes this a social dilemma: the move that is best for you on your own is the',
    'move that makes everyone, on average, worse off. And because all three',
    'countries can see that same arithmetic, all three are tempted at once.',
    '',
    '## 5. Best response',
    '',
    'Your best response is the output that earns you the most, given what everyone',
    'else produces. Because the price falls in a straight line, there is a neat',
    'formula for it:',
    '',
    '    your best output = (a - cost - b x everyone else) / (2 x b)',
    '',
    'capped at your capacity and never below 0.',
    '',
    '| If the others produce in total | Your best output |',
    '| --- | --- |',
    ...brRows.map((others) => {
      const capped = bestResponseTenths(others, settings);
      const raw = bestResponseRawTenths(others, settings);
      const note =
        raw === capped
          ? ''
          : ` (the formula asks for ${formatQuantity(raw)}, but capacity is ${formatQuantity(u.capacityTenths)})`;
      return `| ${formatQuantity(others)} | ${formatQuantity(capped)}${note} |`;
    }),
    '',
    'Notice the pattern: the more the others produce, the less you want to produce.',
    'Your own best move always pushes total supply higher than the cooperative',
    'total, which is exactly why a cartel agreement is hard to hold together.',
    '',
    '## 6. The competitive outcome',
    '',
    'Now let all three countries play their best response at the same time. There',
    'is one output where nobody wants to move: if everyone else is there, you want',
    'to be there too. Economists call it the competitive, or Nash, outcome.',
    '',
    `For this setup it is ${formatQuantity(nash.eachTenths)} each, a total of ${formatQuantity(nash.totalTenths)}.`,
    `The price is ${formatPrice(nash.priceCents)} and each country earns ${formatProfitK(nash.eachProfitK)}.`,
    '',
    '| Outcome | Total supply | Price | Each country | All three |',
    '| --- | --- | --- | --- | --- |',
    `| Everyone cooperates | ${formatQuantity(allCoop.totalTenths)} | ${formatPrice(allCoop.priceCents)} | ${formatProfitK(allCoop.countries.A.profitK)} | ${formatProfitK(jointCoop)} |`,
    `| Everyone competes | ${formatQuantity(allNash.totalTenths)} | ${formatPrice(allNash.priceCents)} | ${formatProfitK(allNash.countries.A.profitK)} | ${formatProfitK(nash.jointProfitK)} |`,
    '',
    `Competing costs each country ${formatProfitK(allCoop.countries.A.profitK - allNash.countries.A.profitK)} a year compared with cooperating,`,
    `and the group ${formatProfitK(jointCoop - nash.jointProfitK)} a year. The oil is still sold; the money just`,
    'goes to buyers instead of producers.',
    '',
    '## 7. So what should you do?',
    '',
    'There is no formula for that, and that is the point of the game. Cooperating',
    'pays best if it holds. Holding it takes talking, promises that people keep,',
    'and a way to react when somebody does not. What you do in the first few years',
    'tends to set the tone for all the rest.',
    '',
  ];

  return `${lines.join('\n')}\n`;
}

/** "+$441.50M" or "-$42.00M", so a change reads as a change. */
function signed(profitK: number): string {
  return profitK > 0 ? `+${formatProfitK(profitK)}` : formatProfitK(profitK);
}
