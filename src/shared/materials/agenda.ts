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

/** How long the four briefing screens and the quick check take out loud. */
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
      say: 'Hand out the briefing and the role cards. Step through the four screens, then the three-question check.',
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
        say: 'Announce: "This is the final year." Then say nothing else and watch what happens.',
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
              ? `Chat window after ${yearLabel(year)}`
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
