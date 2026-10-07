/**
 * instructor-runbook.md: how to run the lesson (SPEC 8.4 Materials).
 *
 * The three agendas are generated from the three presets, so a teacher who
 * reads "Years 1 to 3: 9 minutes" is reading the timers the server will really
 * use. Everything else is the part no program can do: what to say, what to check
 * before the bell, and what to do when a laptop goes to sleep.
 */

import { PRESETS, type PresetName, type Settings } from '../settings.js';
import { agendaMinutes, agendaRows } from './agenda.js';
import type { MaterialBlock, MaterialDoc } from './types.js';

/** The presets a teacher picks between, and the lesson each one is built for. */
const LESSONS: Array<{ preset: PresetName; label: string }> = [
  { preset: 'short-50', label: '50 minutes' },
  { preset: 'standard-75', label: '75 minutes' },
  { preset: 'long-90', label: '90 minutes' },
];

function agendaBlocks(preset: PresetName, label: string): MaterialBlock[] {
  const settings: Settings = PRESETS[preset];
  const rows = agendaRows(settings);
  return [
    { kind: 'subheading', text: `${label} (preset ${preset})` },
    {
      kind: 'paragraph',
      text: `${String(settings.years)} scored years plus a practice year. The stages below add up to about ${String(agendaMinutes(settings))} minutes.`,
    },
    {
      kind: 'table',
      caption: `Agenda for the ${label} lesson`,
      columns: ['Stage', 'Minutes', 'What to do'],
      rows: rows.map((row) => [row.stage, String(row.minutes), row.say]),
    },
  ];
}

export function runbookDoc(): MaterialDoc {
  return {
    slug: 'instructor-runbook',
    title: 'Instructor runbook',
    intro: 'Everything you need to run Crude Accord in one lesson, in the order you need it.',
    blocks: [
      { kind: 'heading', text: 'Before the bell' },
      {
        kind: 'steps',
        items: [
          'On your own computer, run `npm run class`. It prints the instructor link, the projector link and the address the groups type in.',
          'Open the instructor link on your computer and the projector link on the second screen. Keep the instructor link to yourself: it is the only link that can change the game.',
          'Choose a preset on the setup screen and check the live preview. If the numbers look odd, change them back before anyone joins.',
          'Press **Print team cards** and cut them up: one card per group, each with its country and its six-character code.',
          'Check the Wi-Fi by opening the address on one team computer. The group types the code from its card and the dashboard shows that country as ready.',
          'Ask one computer per group to open `/check`. The dashboard then says "Network check: 9 of 9 OK".',
          'Hand out the student briefing and the role cards while groups sit down.',
        ],
      },
      {
        kind: 'note',
        text: 'Everything stays on your computer. The groups reach it over the school network, and nothing is sent to the internet.',
      },

      { kind: 'heading', text: 'Timed agendas' },
      {
        kind: 'paragraph',
        text: 'Pick the preset that fits your lesson. The dashboard then suggests every next step for you, so you only ever press one button.',
      },
      ...LESSONS.flatMap((lesson) => agendaBlocks(lesson.preset, lesson.label)),

      { kind: 'heading', text: 'What to say' },
      {
        kind: 'table',
        caption: 'A line for each stage',
        columns: ['Stage', 'Say something like this'],
        rows: [
          [
            'Welcome',
            'You run a country that sells oil. Two other countries sell into the same market. Nobody sets the price: the three of you do, together, by how much you produce.',
          ],
          [
            'The price rule',
            'Read the rule off the screen with me. Every extra million barrels, from anyone, lowers the price for everyone.',
          ],
          [
            'Roles',
            'One person types. One person calculates. One person talks to the others. The jobs swap, so everyone does each one.',
          ],
          ['Practice year', 'This one does not count. Get the typing wrong now rather than later.'],
          [
            'Year 1 opens',
            'From here it counts. I am not going to tell you what a good number is.',
          ],
          [
            'A chat window',
            'You have the time on the screen. A promise with a number in it is worth more than a friendly message.',
          ],
          [
            'The summit',
            'Envoys only, at this table. The rest of your group stays seated and keeps thinking.',
          ],
          [
            'Price falls sharply',
            'Something changed in the market. I am not going to say what. Decide what you think it was.',
          ],
          ['Final year', 'This is the final year. That is all I am going to say.'],
          [
            'Debrief',
            'Nobody is in trouble here. We are looking at what the three of you did together, not at who won.',
          ],
        ],
      },

      { kind: 'heading', text: 'Running the three set pieces' },
      { kind: 'subheading', text: 'The practice year' },
      {
        kind: 'bullets',
        items: [
          'Walk the room. Every group should submit something, even a silly number.',
          'Point at the status line: "Submitted 38.3 - you can change it until the timer ends."',
          'Say twice that the practice year is left out of every score.',
        ],
      },
      { kind: 'subheading', text: 'A chat window' },
      {
        kind: 'bullets',
        items: [
          'Only the Envoy types. Make that rule out loud, or three people will fight over one keyboard.',
          'The chat is per world: a group only ever talks to the other two countries in its own world.',
          'If a group is unkind, mute it from the dashboard for one window and say why.',
        ],
      },
      { kind: 'subheading', text: 'The summit' },
      {
        kind: 'bullets',
        items: [
          'Pick one table per world before the lesson and point at it. Envoys stand; it keeps the summit short.',
          'Stay out of it. Let them agree or fail to agree.',
          'When the timer ends, send them back and open the next year straight away, while the promise is fresh.',
        ],
      },

      { kind: 'heading', text: 'If something goes wrong' },
      {
        kind: 'table',
        caption: 'Troubleshooting',
        columns: ['What you see', 'What to do'],
        rows: [
          [
            'A terminal says it is offline',
            'The group keeps playing: whatever they submitted is saved on your computer. If the banner stays, reload that page. Decisions already sent are not lost.',
          ],
          [
            'A group claimed the wrong country',
            'On the dashboard, open that country and press **Release terminal**, then have the group type the code from its own card again.',
          ],
          [
            'Two computers want the same country',
            'The second one asks you to approve a takeover. Approve it only for the group that is really at that table; the other computer then gets the "controlled from another computer" screen.',
          ],
          [
            'The projector is blank',
            'The projector link needs its own key. Press **Projector link** on the dashboard again and open the link it gives you. Check the browser is not on a sleeping tab.',
          ],
          [
            'A laptop went to sleep',
            'It rejoins by itself when it wakes. If it does not, reload. The group has lost no data; only the clock on screen was wrong.',
          ],
          [
            'You restarted the server',
            'Everything comes back exactly where it was, paused, and the dashboard says "Resumed after restart - press Resume". Press it when the room is ready.',
          ],
          [
            'A group ran out of time',
            'Their country repeats last year’s number, marked "auto". Say it out loud: it is part of the lesson that not deciding is a decision.',
          ],
          [
            'You are running out of lesson',
            'Press **End game** at any point. The years already played are scored and the debrief works normally. A short game debriefs just as well as a long one.',
          ],
        ],
      },

      { kind: 'heading', text: 'Afterwards' },
      {
        kind: 'bullets',
        items: [
          'Press **Reveal results to teams** before you start the debrief, so groups can see the other worlds and the leaderboard on their own screens.',
          'Use **Show on projector** on each debrief screen rather than mirroring your whole desktop: the dashboard has your instructor key on it.',
          'Download the CSV files if you want to look at the decisions later, or the JSON file if you want everything.',
          'Delete the session data from the dashboard when you no longer need it.',
        ],
      },
    ],
  };
}
