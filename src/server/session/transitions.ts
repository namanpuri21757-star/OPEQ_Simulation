/**
 * The phase transition table (SPEC section 4).
 *
 * Every phase change in the game is listed here once. The reducer asks this
 * table before it does anything, so a command can never invent a path, and
 * docs/STATE-MACHINE.md is generated from the same rows - the documentation and
 * the code cannot drift apart.
 */

import type { CommandType } from '../../shared/protocol.js';
import { PHASES, type Phase } from '../../shared/state.js';

export interface Transition {
  command: CommandType;
  /** The phases the command may be sent from. */
  from: readonly Phase[];
  /**
   * The phase afterwards. 'same' means the command changes something else
   * (a timer, a message, a setting) and leaves the phase alone.
   */
  to: Phase | 'same';
  /** One line for the table in docs/STATE-MACHINE.md. */
  note: string;
}

const ALL: readonly Phase[] = PHASES;
const TIMED: readonly Phase[] = ['PRACTICE_OPEN', 'YEAR_OPEN', 'BETWEEN'];
const OPEN: readonly Phase[] = ['PRACTICE_OPEN', 'YEAR_OPEN'];

const BETWEEN_YEARS: readonly Phase[] = ['PRACTICE_REVEAL', 'YEAR_REVEAL', 'BETWEEN'];

export const TRANSITIONS: readonly Transition[] = [
  {
    command: 'setBriefingSlide',
    from: ['LOBBY', 'BRIEFING'],
    to: 'BRIEFING',
    note: 'Shows a briefing screen. The first one leaves the lobby.',
  },
  {
    command: 'startPractice',
    from: ['LOBBY', 'BRIEFING'],
    to: 'PRACTICE_OPEN',
    note: 'Opens the practice year (year 0). It is never scored.',
  },
  {
    command: 'closeYear',
    from: ['PRACTICE_OPEN'],
    to: 'PRACTICE_REVEAL',
    note: 'Locks practice, fills missing decisions and resolves every world.',
  },
  {
    command: 'closeYear',
    from: ['YEAR_OPEN'],
    to: 'YEAR_REVEAL',
    note: 'Locks the year, fills missing decisions and resolves every world.',
  },
  {
    command: 'openYear',
    from: BETWEEN_YEARS,
    to: 'YEAR_OPEN',
    note: 'Opens the next scored year. Only ever the year after the current one.',
  },
  {
    command: 'startBetween',
    from: ['YEAR_REVEAL'],
    to: 'BETWEEN',
    note: 'Runs a chat window or a face-to-face summit on a timer.',
  },
  {
    command: 'endBetween',
    from: ['BETWEEN'],
    to: 'YEAR_REVEAL',
    note: 'Ends the activity and goes back to the reveal of the year it followed.',
  },
  {
    command: 'endGame',
    from: ALL.filter((p) => p !== 'ENDED'),
    to: 'ENDED',
    note: 'Ends the game. Any year still open is dropped and never scored.',
  },
  {
    command: 'resetSession',
    from: ALL,
    to: 'LOBBY',
    note: 'Clears every decision, outcome and message. Teams keep their codes.',
  },

  // --- commands that change something other than the phase -------------------
  { command: 'updateSettings', from: ['LOBBY'], to: 'same', note: 'Setup only.' },
  { command: 'pause', from: TIMED, to: 'same', note: 'Keeps the remaining time.' },
  { command: 'resume', from: TIMED, to: 'same', note: 'Rebuilds the deadline.' },
  { command: 'extend', from: TIMED, to: 'same', note: 'Adds 1 to 600 seconds.' },
  { command: 'announce', from: ALL, to: 'same', note: 'To every world or to one.' },
  {
    command: 'fireEvent',
    from: BETWEEN_YEARS,
    to: 'same',
    note: 'Between years only. Takes effect in the next year.',
  },
  {
    command: 'announceFinalYear',
    from: BETWEEN_YEARS,
    to: 'same',
    note: 'Only when the next year is the last one.',
  },
  {
    command: 'overrideDecision',
    from: OPEN,
    to: 'same',
    note: 'Open year only. A reason is required and is logged.',
  },
  { command: 'muteTeam', from: ALL, to: 'same', note: 'Stops that team sending messages.' },
  { command: 'unmuteTeam', from: ALL, to: 'same', note: 'Lets it send again.' },
  { command: 'releaseTerminal', from: ALL, to: 'same', note: 'Frees a team to be claimed again.' },
  {
    command: 'approveTakeover',
    from: ALL,
    to: 'same',
    note: 'Hands the team to the new terminal.',
  },
  { command: 'denyTakeover', from: ALL, to: 'same', note: 'Leaves the team where it is.' },
  {
    command: 'revealResultsToTeams',
    from: ['ENDED'],
    to: 'same',
    note: 'Opens other worlds and the leaderboard to teams.',
  },
  { command: 'setProjectorScreen', from: ALL, to: 'same', note: 'Mirrors a debrief screen.' },
  { command: 'deleteSession', from: ALL, to: 'same', note: 'Removes the saved data.' },
  { command: 'claimTeam', from: ALL, to: 'same', note: 'A terminal takes a country.' },
  { command: 'setMembers', from: ALL, to: 'same', note: 'First names, 1 to 4.' },
  {
    command: 'submitDecision',
    from: OPEN,
    to: 'same',
    note: 'Can be changed until the year closes. The last one counts.',
  },
  { command: 'recordHuddle', from: OPEN, to: 'same', note: 'Private to the team and instructor.' },
  { command: 'submitPrediction', from: OPEN, to: 'same', note: 'Only after submitting.' },
  { command: 'submitReflection', from: ['ENDED'], to: 'same', note: 'Three questions at the end.' },
  { command: 'sendMessage', from: ALL, to: 'same', note: 'Subject to the chat mode and mute.' },
  { command: 'sendPledge', from: ALL, to: 'same', note: 'A promise, compared at the reveal.' },
  { command: 'report', from: ALL, to: 'same', note: 'A network check result.' },
];

/** Index: command type to the rows that mention it. */
const BY_COMMAND = new Map<CommandType, Transition[]>();
for (const row of TRANSITIONS) {
  const list = BY_COMMAND.get(row.command);
  if (list) list.push(row);
  else BY_COMMAND.set(row.command, [row]);
}

/**
 * The row that applies, or null when the command is not allowed from here.
 *
 * The 'same' rows are tried last, so closeYear from YEAR_OPEN finds the real
 * transition rather than a catch-all.
 */
export function transitionFor(command: CommandType, phase: Phase): Transition | null {
  const rows = BY_COMMAND.get(command) ?? [];
  const real = rows.find((row) => row.to !== 'same' && row.from.includes(phase));
  if (real) return real;
  return rows.find((row) => row.to === 'same' && row.from.includes(phase)) ?? null;
}

/** The phases a command may be sent from, across all of its rows. */
export function phasesFor(command: CommandType): Phase[] {
  const rows = BY_COMMAND.get(command) ?? [];
  const seen = new Set<Phase>();
  for (const row of rows) for (const phase of row.from) seen.add(phase);
  return PHASES.filter((p) => seen.has(p));
}

/**
 * A kind sentence for a command that arrived in the wrong phase, naming what
 * the person would have to do instead.
 */
export function wrongPhaseMessage(command: CommandType, phase: Phase): string {
  const allowed = phasesFor(command);
  if (allowed.length === 0) {
    return `"${command}" does not change the game, so it cannot be used here.`;
  }
  return `"${command}" cannot be used during ${phase}. It works during ${allowed.join(', ')}.`;
}
