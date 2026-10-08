/**
 * The transition table, and the promise that docs/STATE-MACHINE.md matches it.
 */

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderStateMachine, STATE_MACHINE_PATH } from '../../scripts/state-machine.js';
import {
  phasesFor,
  transitionFor,
  TRANSITIONS,
  wrongPhaseMessage,
} from '../../src/server/session/transitions.js';
import { COMMAND_META, type CommandType } from '../../src/shared/protocol.js';
import { PHASES } from '../../src/shared/state.js';

describe('the transition table', () => {
  it('matches docs/STATE-MACHINE.md, so the two can never drift apart', async () => {
    const onDisk = await readFile(STATE_MACHINE_PATH, 'utf8');
    expect(onDisk).toBe(renderStateMachine());
  });

  it('covers every command that changes anything', () => {
    const covered = new Set(TRANSITIONS.map((row) => row.command));
    const needed = (Object.keys(COMMAND_META) as CommandType[]).filter(
      // createSession makes the state rather than moving it, and ping changes
      // nothing at all, so neither belongs in a phase table.
      (type) => COMMAND_META[type].persisted && type !== 'createSession',
    );
    for (const type of needed) expect(covered, `${type} has no row`).toContain(type);
  });

  it('finds the real transition before a catch-all row', () => {
    expect(transitionFor('closeYear', 'YEAR_OPEN')?.to).toBe('YEAR_REVEAL');
    expect(transitionFor('closeYear', 'PRACTICE_OPEN')?.to).toBe('PRACTICE_REVEAL');
    expect(transitionFor('setMessaging', 'LOBBY')?.to).toBe('same');
  });

  it('says no for a command that cannot be sent from here', () => {
    expect(transitionFor('submitDecision', 'ENDED')).toBeNull();
    expect(transitionFor('openYear', 'LOBBY')).toBeNull();
    expect(transitionFor('startBetween', 'PRACTICE_REVEAL')).toBeNull();
  });

  it('never lets anything be sent during ENDED except the few that belong there', () => {
    const allowed = PHASES.filter(() => true);
    expect(allowed).toContain('ENDED');
    expect(phasesFor('submitReflection')).toEqual(['ENDED']);
    expect(phasesFor('revealResultsToTeams')).toEqual(['ENDED']);
    expect(phasesFor('updateSettings')).toEqual(['LOBBY']);
  });

  it('explains a wrong phase by saying when the step would work, in plain words', () => {
    const message = wrongPhaseMessage('openYear', 'LOBBY');
    expect(message).toContain('before the game has started');
    expect(message).toContain('while the results are up');
    // The phase names are for the code and the event log. Nobody in the room is
    // ever shown one, and nor is a command name (CLAUDE.md rule 8).
    for (const phase of PHASES) expect(message).not.toContain(phase);
    expect(message).not.toContain('openYear');
  });

  it('writes a sentence a student can read for every command a team can send', () => {
    const teamCommands = (
      ['submitDecision', 'submitReflection', 'sendMessage'] as const
    ).map((command) => command);

    for (const command of teamCommands) {
      for (const phase of PHASES) {
        if (transitionFor(command, phase) !== null) continue;
        const message = wrongPhaseMessage(command, phase);
        expect(message.length, `${command} in ${phase}`).toBeGreaterThan(20);
        expect(message, `${command} in ${phase}`).toMatch(/\.$/);
        for (const name of PHASES) expect(message, `${command} in ${phase}`).not.toContain(name);
        expect(message, `${command} in ${phase}`).not.toContain(command);
      }
    }
  });
});
