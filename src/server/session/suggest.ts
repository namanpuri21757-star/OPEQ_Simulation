/**
 * The one suggested next action (SPEC 8.4).
 *
 * The instructor dashboard has exactly one big button, and this decides what it
 * says. It follows the schedule in the settings, so a teacher who only ever
 * presses the big button still runs the lesson as planned: close the year, run
 * the chat window or summit that is due, warn about the final year, open the
 * next year, end the game.
 */

import { activitiesAfterYear, type Settings } from '../../shared/settings.js';
import { BRIEFING_SLIDES, type SessionState } from '../../shared/state.js';
import type { SuggestedAction } from '../../shared/views.js';

/** "4 min", or "90 s" when it is not a whole number of minutes. */
function duration(seconds: number): string {
  return seconds % 60 === 0 ? `${String(seconds / 60)} min` : `${String(seconds)} s`;
}

/** The first scheduled activity after a year that has not been run yet. */
function dueActivity(state: SessionState, settings: Settings) {
  return activitiesAfterYear(state.year, settings).find(
    (item) => !state.activitiesDone.includes(`${String(state.year)}:${item.kind}`),
  );
}

function action(
  state: SessionState,
  command: string | null,
  label: string,
  payload: Record<string, unknown> = {},
): SuggestedAction {
  return { command, label, payload, expectedPhase: state.phase, expectedYear: state.year };
}

export function nextSuggestedAction(state: SessionState): SuggestedAction {
  const settings = state.settings;

  switch (state.phase) {
    case 'LOBBY':
      return action(state, 'setBriefingSlide', 'Start the briefing', { slide: 0 });

    case 'BRIEFING':
      return state.briefingSlide < BRIEFING_SLIDES - 1
        ? action(state, 'setBriefingSlide', 'Next briefing screen', {
            slide: state.briefingSlide + 1,
          })
        : action(state, 'startPractice', 'Start the practice year');

    case 'PRACTICE_OPEN':
      return action(state, 'closeYear', 'Close the practice year');

    case 'PRACTICE_REVEAL':
      return action(state, 'openYear', 'Start Year 1', { year: 1 });

    case 'YEAR_OPEN':
      return action(state, 'closeYear', `Close Year ${String(state.year)}`);

    case 'YEAR_REVEAL': {
      const activity = dueActivity(state, settings);
      if (activity) {
        const label =
          activity.kind === 'chat'
            ? `Open chat window (${duration(activity.seconds)})`
            : `Hold the summit (${duration(activity.seconds)})`;
        return action(state, 'startBetween', label, {
          kind: activity.kind,
          seconds: activity.seconds,
        });
      }

      if (state.year >= settings.years) return action(state, 'endGame', 'End the game');

      const nextIsFinal = state.year + 1 === settings.years;
      if (nextIsFinal && settings.finalYearWarning && !state.finalYearAnnounced) {
        return action(state, 'announceFinalYear', 'Announce the final year');
      }
      return action(state, 'openYear', `Start Year ${String(state.year + 1)}`, {
        year: state.year + 1,
      });
    }

    case 'BETWEEN': {
      const label = state.between?.kind === 'summit' ? 'End the summit' : 'End the chat window';
      return action(state, 'endBetween', label);
    }

    case 'ENDED':
      return state.resultsRevealedToTeams
        ? action(state, null, 'Open the debrief')
        : action(state, 'revealResultsToTeams', 'Reveal results to teams');

    default: {
      const never: never = state.phase;
      return action(state, null, `Unknown phase ${String(never)}`);
    }
  }
}
