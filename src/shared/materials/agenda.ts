/**
 * A timed agenda worked out from the settings, not typed by hand.
 *
 * The runbook promises a teacher that a preset fits a lesson, so the minutes
 * have to come from the same timers and schedule the server actually runs. The
 * three fixed allowances below (briefing, each reveal, debrief) are the parts
 * that are a teacher talking rather than a timer counting.
 */

import { activitiesAfterYear, secondsForYear, type Settings } from '../settings.js';
import { yearLabel } from '../labels.js';

/** How long the four briefing screens take out loud. */
const BRIEFING_SECONDS = 360;
/** How long a reveal takes: read the price, hear the groans, move on. */
const REVEAL_SECONDS = 45;
/** The final-year announcement and the reaction to it. */
const FINAL_YEAR_SECONDS = 60;
/** The debrief deck and the discussion around it. */
const DEBRIEF_SECONDS = 720;

export interface AgendaRow {
  stage: string;
  minutes: number;
  /** What to say, or what to do, at that point. */
  say: string;
}

/** Minutes, rounded up, and never zero so no row looks free. */
function minutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** The years between one activity and the next, as "Years 1 to 3". */
function yearRange(from: number, to: number): string {
  if (from === to) return yearLabel(from);
  return `Years ${String(from)} to ${String(to)}`;
}

export function agendaRows(settings: Settings): AgendaRow[] {
  const rows: AgendaRow[] = [
    {
      stage: 'Welcome and briefing',
      minutes: minutes(BRIEFING_SECONDS),
      say: 'Hand out the briefing and the role cards, then step through the four screens.',
    },
    {
      stage: 'Practice year',
      minutes: minutes(secondsForYear(0, settings) + REVEAL_SECONDS),
      say: 'Say clearly that this one does not count. Walk round and check every group has submitted something.',
    },
  ];

  let blockStart = 1;
  let blockSeconds = 0;

  const flush = (lastYear: number): void => {
    if (blockSeconds === 0) return;
    rows.push({
      stage: yearRange(blockStart, lastYear),
      minutes: minutes(blockSeconds),
      say:
        blockStart === 1
          ? 'Press the one big button and let the timers run. Say nothing about what a good number is.'
          : 'Keep pressing the big button. Read out the price each year and let the room react.',
    });
    blockSeconds = 0;
  };

  for (let year = 1; year <= settings.years; year += 1) {
    if (year === settings.years && settings.finalYearWarning && settings.years > 1) {
      flush(year - 1);
      rows.push({
        stage: 'Final-year warning',
        minutes: minutes(FINAL_YEAR_SECONDS),
        say: 'Say out loud: "This is the final year." Press the final-year warning so every screen says so, then say nothing else and watch what happens.',
      });
      blockStart = year;
    }

    blockSeconds += secondsForYear(year, settings) + REVEAL_SECONDS;

    const activities = activitiesAfterYear(year, settings);
    if (activities.length > 0) {
      flush(year);
      for (const activity of activities) {
        rows.push({
          stage:
            activity.kind === 'chat'
              ? `Messaging on after ${yearLabel(year)}`
              : `Summit after ${yearLabel(year)}`,
          minutes: minutes(activity.seconds),
          say:
            activity.kind === 'chat'
              ? 'Remind them that a promise with a number in it is worth more than a friendly message.'
              : 'Send the Envoys to one table. Everyone else stays seated and keeps thinking.',
        });
      }
      blockStart = year + 1;
    }
  }
  flush(settings.years);

  rows.push({
    stage: 'Debrief',
    minutes: minutes(DEBRIEF_SECONDS),
    say: 'End the game, release the results, then work through the debrief screens in order.',
  });

  return rows;
}

export function agendaMinutes(settings: Settings): number {
  return agendaRows(settings).reduce((sum, row) => sum + row.minutes, 0);
}

/**
 * The same lesson in six lines, for the teacher's start screen (SPEC 8.4).
 *
 * agendaRows is the runbook's version: a row per block of years, so a teacher
 * can follow it with a watch. This one is the shape of the lesson, which is what
 * someone reading the screen before the bell actually needs. Both come out of
 * the same settings, so they can never describe different lessons.
 */
export function classPlan(settings: Settings): AgendaRow[] {
  const chats = settings.schedule.filter((item) => item.kind === 'chat');
  const summits = settings.schedule.filter((item) => item.kind === 'summit');
  const yearSeconds = Array.from({ length: settings.years }, (_, i) =>
    secondsForYear(i + 1, settings),
  ).reduce((sum, seconds) => sum + seconds + REVEAL_SECONDS, 0);

  const rows: AgendaRow[] = [
    {
      stage: 'Briefing: four screens, you move them on',
      minutes: minutes(BRIEFING_SECONDS),
      say: 'Hand out the briefing and the role cards.',
    },
    {
      stage: 'Practice year, which does not count',
      minutes: minutes(secondsForYear(0, settings) + REVEAL_SECONDS),
      say: 'Check every group has submitted something.',
    },
    {
      stage: `${String(settings.years)} scored years, one decision each`,
      minutes: minutes(yearSeconds),
      say: 'Press the one big button between years.',
    },
  ];

  if (chats.length > 0) {
    rows.push({
      stage: `Messaging windows (${String(chats.length)})`,
      minutes: minutes(chats.reduce((sum, item) => sum + item.seconds, 0)),
      say: 'You turn messaging on and off. It is off by default.',
    });
  }
  if (summits.length > 0) {
    rows.push({
      stage: `Summits, where the Envoys meet (${String(summits.length)})`,
      minutes: minutes(summits.reduce((sum, item) => sum + item.seconds, 0)),
      say: 'Send the Envoys to one table per world.',
    });
  }

  rows.push({
    stage: 'Debrief: the charts and the questions',
    minutes: minutes(DEBRIEF_SECONDS),
    say: 'End the game, release the results, then work through the screens.',
  });

  return rows;
}
