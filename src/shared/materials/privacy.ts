/**
 * privacy-note.md: the page to hand a parent or a head of department
 * (SPEC section 9 Privacy).
 *
 * Short, specific and honest: what is collected, where it sits, who can see it
 * and how to delete it. Nothing here is a promise the program does not keep.
 */

import type { MaterialDoc } from './types.js';

export function privacyDoc(): MaterialDoc {
  return {
    slug: 'privacy-note',
    title: 'What this activity records',
    intro: 'A short note for parents, carers and school administrators.',
    blocks: [
      { kind: 'heading', text: 'What it is' },
      {
        kind: 'paragraph',
        text: 'Crude Accord is a classroom simulation about how countries that sell oil compete and cooperate. Students work in groups of two or three, each group sharing one computer. There are no accounts and no logins.',
      },

      { kind: 'heading', text: 'What is collected' },
      {
        kind: 'bullets',
        items: [
          'First names only, and only if a group chooses to type them. A group that types nothing is shown as "Member 1", "Member 2" and so on, and the activity works exactly the same.',
          'The numbers each group decides each year, and the results the program works out from them.',
          'The messages groups send to the other two countries in their own world, during the short chat windows.',
          'Optional notes: what each member suggested before the group decided, a guess at what the other countries would do, and three short answers at the end.',
        ],
      },
      {
        kind: 'paragraph',
        text: 'Nothing else is collected. No surname, no email address, no date of birth, no class list, no photographs, no device identifiers and no location.',
      },

      { kind: 'heading', text: 'Where it is kept' },
      {
        kind: 'bullets',
        items: [
          'On the teacher’s own computer, in a folder inside the program, and nowhere else.',
          'The program needs no internet connection while the class runs, and makes no calls to any outside service. There are no analytics and no advertising.',
          'Student computers reach the teacher’s computer over the school network only.',
        ],
      },

      { kind: 'heading', text: 'Who can see it' },
      {
        kind: 'bullets',
        items: [
          'The teacher sees everything, which is how the discussion at the end of the lesson works.',
          'A group sees only its own country and the other two countries in its own world. It never sees another world, and never sees another group’s messages.',
          'The projector screen shows public information only: the year, the clock and, if the teacher allows it, each world’s price. It never shows a message.',
          'A teacher may download the results as a spreadsheet file to look at later. Those files are the teacher’s to look after, under the school’s normal rules.',
        ],
      },

      { kind: 'heading', text: 'How to delete it' },
      {
        kind: 'steps',
        items: [
          'The teacher opens the dashboard and presses **Delete this game’s data**, then types DELETE to confirm.',
          'That removes the whole folder for that lesson: names, decisions, messages and notes.',
          'Any spreadsheet files already downloaded have to be deleted separately, wherever they were saved.',
        ],
      },
      {
        kind: 'note',
        text: 'If you would rather your child did not type a first name, they do not have to. Tell the teacher, and the group will use the numbered names instead.',
      },
    ],
  };
}
