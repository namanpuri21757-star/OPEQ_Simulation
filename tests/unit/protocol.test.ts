/**
 * The wire protocol: what the schema accepts, what it refuses, and the friendly
 * wording a client gets back (SPEC section 9, CLAUDE.md rules 4 and 8).
 */

import { describe, expect, it } from 'vitest';
import {
  ACK_CODES,
  COMMAND_META,
  helloSchema,
  MAX_MESSAGE_CHARS,
  parseCommand,
  type CommandType,
} from '../../src/shared/protocol.js';

const envelope = (type: string, payload: unknown, extra: Record<string, unknown> = {}) => ({
  commandId: 'command-0001',
  type,
  payload,
  ...extra,
});

describe('parsing a command', () => {
  it('accepts a well-formed command and fills in the defaults', () => {
    const result = parseCommand(envelope('createSession', {}));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.payload).toMatchObject({ preset: 'standard-75' });
  });

  it('refuses an unknown command type', () => {
    const result = parseCommand(envelope('launchMissiles', {}));
    expect(result.ok).toBe(false);
  });

  it('refuses a field that does not belong to the payload', () => {
    const result = parseCommand(envelope('submitDecision', { tenths: 383, cheat: true }));
    expect(result.ok).toBe(false);
  });

  it('refuses a quantity that is not whole tenths', () => {
    expect(parseCommand(envelope('submitDecision', { tenths: 38.3 })).ok).toBe(false);
    expect(parseCommand(envelope('submitDecision', { tenths: -1 })).ok).toBe(false);
  });

  it('refuses a message over the limit and names the field', () => {
    const result = parseCommand(
      envelope('sendMessage', { text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('text');
  });

  it('tidies a join code before anyone looks it up', () => {
    const result = parseCommand(envelope('claimTeam', { joinCode: '  k4m7xp ' }));
    expect(result.ok).toBe(true);
    if (!result.ok || result.command.type !== 'claimTeam') return;
    expect(result.command.payload.joinCode).toBe('K4M7XP');
  });

  it('trims the names a group types and refuses an empty list', () => {
    const good = parseCommand(envelope('setMembers', { names: ['  Ada  ', 'Ben'] }));
    expect(good.ok).toBe(true);
    if (good.ok && good.command.type === 'setMembers') {
      expect(good.command.payload.names).toEqual(['Ada', 'Ben']);
    }
    expect(parseCommand(envelope('setMembers', { names: [] })).ok).toBe(false);
    expect(parseCommand(envelope('setMembers', { names: ['   '] })).ok).toBe(false);
  });

  it('needs the typed word for the two irreversible commands', () => {
    expect(parseCommand(envelope('resetSession', { confirm: 'RESET' })).ok).toBe(true);
    expect(parseCommand(envelope('resetSession', { confirm: 'reset' })).ok).toBe(false);
    expect(parseCommand(envelope('deleteSession', { confirm: 'DELETE' })).ok).toBe(true);
    expect(parseCommand(envelope('deleteSession', { confirm: 'delete' })).ok).toBe(false);
  });

  it('keeps extend inside 1 to 600 seconds', () => {
    expect(parseCommand(envelope('extend', { seconds: 600 })).ok).toBe(true);
    expect(parseCommand(envelope('extend', { seconds: 601 })).ok).toBe(false);
    expect(parseCommand(envelope('extend', { seconds: 0 })).ok).toBe(false);
  });

  it('carries the guards when they are given', () => {
    const result = parseCommand(
      envelope('closeYear', {}, { expectedPhase: 'YEAR_OPEN', expectedYear: 3 }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.command.expectedPhase).toBe('YEAR_OPEN');
    expect(result.command.expectedYear).toBe(3);
  });

  it('refuses a phase that is not a phase', () => {
    expect(
      parseCommand(envelope('closeYear', {}, { expectedPhase: 'TEATIME', expectedYear: 3 })).ok,
    ).toBe(false);
  });

  it('gives a message rather than a pile of zod issues', () => {
    const result = parseCommand({ nonsense: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.message).not.toContain('ZodError');
  });
});

describe('the command table', () => {
  it('names an actor for every command', () => {
    for (const type of Object.keys(COMMAND_META) as CommandType[]) {
      expect(COMMAND_META[type].actors.length, type).toBeGreaterThan(0);
    }
  });

  it('lets only the system join the instructor on the automatic steps', () => {
    expect(COMMAND_META.closeYear.actors).toContain('system');
    expect(COMMAND_META.endBetween.actors).toContain('system');
    // autoAdvance: the tick opens the next year and gives the final-year warning.
    expect(COMMAND_META.openYear.actors).toContain('system');
    expect(COMMAND_META.announceFinalYear.actors).toContain('system');
    // Everything else that moves the lesson still needs the teacher.
    for (const type of ['startPractice', 'startBetween', 'endGame', 'resetSession'] as const) {
      expect(COMMAND_META[type].actors, type).not.toContain('system');
    }
  });

  it('guards every command where a late click would do harm', () => {
    for (const type of [
      'submitDecision',
      'closeYear',
      'openYear',
      'startBetween',
      'endBetween',
      'overrideDecision',
      'announceFinalYear',
    ] as CommandType[]) {
      expect(COMMAND_META[type].guarded, type).toBe(true);
    }
    expect(COMMAND_META.ping.guarded).toBe(false);
  });

  it('writes nothing to disk for a command that changes nothing', () => {
    expect(COMMAND_META.ping.persisted).toBe(false);
  });
});

describe('saying hello', () => {
  it('needs the matching key for each role', () => {
    expect(helloSchema.safeParse({ role: 'setup' }).success).toBe(true);
    expect(
      helloSchema.safeParse({
        role: 'instructor',
        sessionId: 'abcd',
        instructorKey: 'k'.repeat(24),
      }).success,
    ).toBe(true);
    expect(helloSchema.safeParse({ role: 'instructor', sessionId: 'abcd' }).success).toBe(false);
    expect(helloSchema.safeParse({ role: 'team', sessionId: 'abcd' }).success).toBe(true);
    expect(helloSchema.safeParse({ role: 'pirate', sessionId: 'abcd' }).success).toBe(false);
  });
});

describe('ack codes', () => {
  it('are exactly the ones the brief asks for', () => {
    expect([...ACK_CODES].sort()).toEqual(
      [
        'CLOSED',
        'INVALID',
        'MUTED',
        'NEEDS_APPROVAL',
        'NOT_ALLOWED',
        'NOT_FOUND',
        'RATE_LIMITED',
        'STALE',
        'STORAGE',
      ].sort(),
    );
  });
});
