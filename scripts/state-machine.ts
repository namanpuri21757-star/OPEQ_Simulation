/**
 * Writes docs/STATE-MACHINE.md from the transition table in the code.
 *
 * Why generated: the brief asks for the table to be in both places, and a
 * hand-written copy goes stale the first time a transition changes. A unit test
 * compares the file with this output, so the two can never drift apart.
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRANSITIONS } from '../src/server/session/transitions.js';
import { PHASES } from '../src/shared/state.js';

export const STATE_MACHINE_PATH = fileURLToPath(
  new URL('../docs/STATE-MACHINE.md', import.meta.url),
);

const PHASE_NOTES: Record<string, string> = {
  LOBBY: 'Teams claim their countries. Settings can still be changed here.',
  BRIEFING: 'The four briefing screens, in sync with the instructor.',
  PRACTICE_OPEN: 'The practice year (year 0) is open. It is never scored.',
  PRACTICE_REVEAL: 'The practice result is on screen.',
  YEAR_OPEN: 'A scored year is open and decisions can still be changed.',
  YEAR_REVEAL: 'The year has been settled and the result is on screen.',
  BETWEEN: 'A chat window or a face-to-face summit, on a deadline.',
  ENDED: 'The game is over. Reflections, then results released to teams.',
};

export function renderStateMachine(): string {
  const lines: string[] = [];

  lines.push('# State machine');
  lines.push('');
  lines.push(
    'Generated from `TRANSITIONS` in `src/server/session/transitions.ts` by `npm run docs`.',
  );
  lines.push('Do not edit by hand: a unit test fails if this file and the code disagree.');
  lines.push('');

  lines.push('## Phases');
  lines.push('');
  lines.push('| Phase | What is happening |');
  lines.push('| --- | --- |');
  for (const phase of PHASES) lines.push(`| ${phase} | ${PHASE_NOTES[phase] ?? ''} |`);
  lines.push('');

  lines.push('## Transitions that change the phase');
  lines.push('');
  lines.push('| Command | From | To | Notes |');
  lines.push('| --- | --- | --- | --- |');
  for (const row of TRANSITIONS) {
    if (row.to === 'same') continue;
    lines.push(`| ${row.command} | ${row.from.join(', ')} | ${row.to} | ${row.note} |`);
  }
  lines.push('');

  lines.push('## Commands that leave the phase alone');
  lines.push('');
  lines.push('| Command | Allowed during | Notes |');
  lines.push('| --- | --- | --- |');
  for (const row of TRANSITIONS) {
    if (row.to !== 'same') continue;
    const from = row.from.length === PHASES.length ? 'any phase' : row.from.join(', ');
    lines.push(`| ${row.command} | ${from} | ${row.note} |`);
  }
  lines.push('');

  lines.push('## Timers and pausing');
  lines.push('');
  lines.push(
    'PRACTICE_OPEN, YEAR_OPEN and BETWEEN run on a deadline stored in the state. `pause` keeps the remaining time and clears the deadline; `resume` rebuilds the deadline from the remaining time; `extend` adds 1 to 600 seconds to whichever of the two is in use. A one-second tick sends `closeYear` or `endBetween` as the system actor once a deadline has passed, and those are saved to `events.jsonl` exactly like a click. After a restart a phase that was running comes back paused, with the time it had left.',
  );
  lines.push('');

  lines.push('## The suggested next action');
  lines.push('');
  lines.push(
    '`nextSuggestedAction(session)` in `src/server/session/suggest.ts` decides the one big button on the dashboard. It follows the schedule in the settings: finish the briefing, start practice, close the open year, run any chat window or summit that is due after this year, announce the final year when the next year is the last one, open the next year, end the game, release the results.',
  );
  lines.push('');

  return lines.join('\n');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await writeFile(STATE_MACHINE_PATH, renderStateMachine(), 'utf8');
  console.log(`Wrote ${STATE_MACHINE_PATH}`);
}
