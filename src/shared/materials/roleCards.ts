/**
 * role-cards.md: one card per job, to put on the table beside the terminal
 * (SPEC section 5).
 *
 * The tips are concrete on purpose. "Communicate well" helps nobody; "say the
 * number out loud before you press Submit" is something a fourteen-year-old can
 * actually do in the ninety seconds they have.
 */

import { economicUnits, type Settings } from '../settings.js';
import { formatQuantity } from '../units.js';
import type { MaterialDoc } from './types.js';

export function roleCardsDoc(settings: Settings): MaterialDoc {
  const u = economicUnits(settings);

  return {
    slug: 'role-cards',
    title: 'Role cards',
    intro: `Cut these out and put one in front of each person. The jobs swap every ${String(settings.rotateEvery)} years; the terminal always says who holds which job.`,
    blocks: [
      { kind: 'heading', text: 'Operator' },
      {
        kind: 'paragraph',
        text: 'You sit at the keyboard. Your country speaks with one voice: yours.',
      },
      {
        kind: 'bullets',
        items: [
          'Say the number out loud before you press Submit, so the whole group hears it. Mistyped numbers are the most common way a group loses a year.',
          `Submit early, even if you are not sure. You can change it until the timer ends, and a submitted number beats the one the server fills in for you (${formatQuantity(u.startingOutputTenths)} in the first year, or last year's number after that).`,
          'Watch the clock, not the argument. When 30 seconds are left, say so.',
          'Read the results table out loud before the group decides. What a country did last year is the best clue to what it will do this year.',
          `Remember that your own extra barrels push the price down too. Going from ${formatQuantity(u.startingOutputTenths)} to ${formatQuantity(u.capacityTenths)} does not multiply your profit.`,
        ],
      },

      { kind: 'heading', text: 'Envoy' },
      { kind: 'paragraph', text: 'You are the only one who talks to the other countries.' },
      {
        kind: 'bullets',
        items: [
          `Say a number, not a feeling. "We will produce ${formatQuantity(u.startingOutputTenths)}" can be checked; "we will be reasonable" cannot.`,
          'Ask the others for a number too, and write down what they said. At the next reveal everyone can see who kept their word.',
          'If someone broke a promise, decide with your group what you will do about it before you answer. An angry reply in the chat window costs you a year of thinking time.',
        ],
      },

      { kind: 'heading', text: 'If your group has two or four people' },
      {
        kind: 'bullets',
        items: [
          'With two, it is one job each.',
          'With three or four, everyone except the Operator is an Envoy. Agree who types the message before the window opens.',
          'With one, you do both jobs.',
        ],
      },
    ],
  };
}
