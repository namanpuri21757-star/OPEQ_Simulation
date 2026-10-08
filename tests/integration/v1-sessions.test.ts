/**
 * Opening a session that v1 saved (SPEC section 12, Changelog).
 *
 * A teacher who updates the app between two lessons should get the first
 * lesson's data back, not an error. Everything v2 removed is dropped on the way
 * in, and a log line for a command that no longer exists is skipped quietly
 * rather than reported as a damaged file.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/shared/settings.js';
import { readEvents, readSnapshot, sessionDir } from '../../src/server/store/files.js';
import { SessionStore } from '../../src/server/store/index.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** Everything v1 wrote and v2 has no field for. */
function v1Snapshot() {
  const settings = {
    ...DEFAULT_SETTINGS,
    chatMode: 'windowsOnly',
    demandEvent: { enabled: true, year: 6, deltaA: -10, message: 'Demand fell.', announced: true },
  };
  return {
    schema: 1,
    sessionId: 'from-v1',
    seed: 'seed-v1',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    version: 12,
    seq: 12,
    instructorKey: 'instructor-key-long-enough-01',
    projectorKey: 'projector-key-long-enough-01',
    settings,
    phase: 'YEAR_REVEAL',
    year: 2,
    briefingSlide: 3,
    timer: { deadline: null, paused: false, remainingMs: null, seconds: null },
    between: null,
    finalYearAnnounced: false,
    resultsRevealedToTeams: false,
    projectorScreen: 'auto',
    projectorWorldNumber: null,
    worlds: [{ worldId: 'world-1', worldNumber: 1, open: null, practice: null, years: [] }],
    teams: {
      'world-1-A': {
        teamId: 'world-1-A',
        worldId: 'world-1',
        worldNumber: 1,
        letter: 'A',
        joinCode: 'W1AXYZ',
        members: ['Ada'],
        claimed: true,
        token: null,
        muted: false,
        pendingTakeover: null,
        huddles: { 1: { suggestions: [{ name: 'Ada', tenths: 383 }], reason: 'secret', at: 1 } },
        predictions: { 1: { othersTenths: [383, 383], trust: 4, at: 1 } },
        reflection: null,
        lastMessageAt: null,
      },
    },
    messages: [
      {
        messageId: 'chat-1',
        worldId: 'world-1',
        teamId: 'world-1-A',
        letter: 'A',
        kind: 'chat',
        text: 'Shall we all keep low?',
        at: 10,
      },
      {
        messageId: 'pledge-1',
        worldId: 'world-1',
        teamId: 'world-1-A',
        letter: 'A',
        kind: 'pledge',
        text: 'We will produce 38.3 million barrels.',
        tenths: 383,
        at: 20,
      },
      {
        messageId: 'note-1',
        worldId: null,
        teamId: null,
        letter: null,
        kind: 'announcement',
        text: 'Five minutes left.',
        at: 30,
      },
    ],
    news: [
      { newsId: 'n1', kind: 'demand', worldId: null, year: 2, text: 'Demand fell.', at: 25 },
    ],
    overrides: [],
    firedEvents: [
      { kind: 'newProducer', year: 9, at: 40 },
      { kind: 'demand', year: 6, at: 41 },
    ],
    networkChecks: {},
    activitiesDone: ['1:chat'],
    results: {},
    resultOrder: [],
  };
}

describe('a snapshot written by v1', () => {
  it('loads, with every removed field dropped and the new ones filled in', async () => {
    const dir = sessionDir(harness.dataDir, 'from-v1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'snapshot.json'), JSON.stringify(v1Snapshot()), 'utf8');

    const state = await readSnapshot(dir, () => undefined);
    expect(state).not.toBeNull();
    if (!state) return;

    // The lesson is still there.
    expect(state.sessionId).toBe('from-v1');
    expect(state.phase).toBe('YEAR_REVEAL');
    expect(state.year).toBe(2);
    expect(state.teams['world-1-A']?.members).toEqual(['Ada']);

    // Everything v2 removed is gone.
    const asRecord = state as unknown as Record<string, unknown>;
    expect(asRecord['news']).toBeUndefined();
    const settings = state.settings as unknown as Record<string, unknown>;
    expect(settings['chatMode']).toBeUndefined();
    expect(settings['demandEvent']).toBeUndefined();
    const team = state.teams['world-1-A'] as unknown as Record<string, unknown>;
    expect(team['huddles']).toBeUndefined();
    expect(team['predictions']).toBeUndefined();
    expect(state.firedEvents).toEqual([{ kind: 'newProducer', year: 9, at: 40 }]);

    // A v1 pledge keeps the sentence the group actually said; an announcement
    // had no world and no country, so there is nowhere left to show it.
    expect(state.messages.map((message) => message.messageId)).toEqual(['chat-1', 'pledge-1']);
    expect(state.messages[1]?.text).toBe('We will produce 38.3 million barrels.');
    expect(state.messages[1]).not.toHaveProperty('kind');
    expect(state.messages[1]).not.toHaveProperty('tenths');

    // And the new field exists, switched off.
    expect(state.messaging).toEqual({});
  });

  it('comes back as a session the server will serve', async () => {
    const dir = sessionDir(harness.dataDir, 'from-v1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'snapshot.json'), JSON.stringify(v1Snapshot()), 'utf8');

    const store = new SessionStore({ dataDir: harness.dataDir, logger: () => undefined });
    await store.loadAll();
    try {
      expect(store.sessionIds()).toContain('from-v1');
      expect(store.get('from-v1')?.messaging).toEqual({});
    } finally {
      await store.close();
    }
  });
});

describe('an event log written by v1', () => {
  it('skips a removed command quietly and keeps everything around it', async () => {
    const dir = sessionDir(harness.dataDir, 'log-v1');
    await mkdir(dir, { recursive: true });
    const lines = [
      { seq: 1, at: 1, actor: 'team', actorId: 'world-1-A', issued: {}, command: {
        commandId: 'cmd-00000001', type: 'submitDecision', payload: { tenths: 383 },
        expectedPhase: 'YEAR_OPEN', expectedYear: 1,
      } },
      { seq: 2, at: 2, actor: 'team', actorId: 'world-1-A', issued: {}, command: {
        commandId: 'cmd-00000002', type: 'recordHuddle',
        payload: { suggestions: [{ name: 'Ada', tenths: 383 }], reason: 'gone' },
      } },
      { seq: 3, at: 3, actor: 'instructor', actorId: null, issued: {}, command: {
        commandId: 'cmd-00000003', type: 'announce', payload: { text: 'Gone too.' },
      } },
      { seq: 4, at: 4, actor: 'instructor', actorId: null, issued: {}, command: {
        commandId: 'cmd-00000004', type: 'closeYear', payload: {},
        expectedPhase: 'YEAR_OPEN', expectedYear: 1,
      } },
    ];
    await writeFile(
      join(dir, 'events.jsonl'),
      `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
      'utf8',
    );

    const warnings: string[] = [];
    const { events, skipped } = await readEvents(dir, (message) => warnings.push(message));

    expect(events.map((event) => event.command.type)).toEqual(['submitDecision', 'closeYear']);
    // Skipped, but not reported: a removed feature is not a damaged file.
    expect(skipped).toBe(0);
    expect(warnings).toEqual([]);
  });
});

describe('a client still sending a removed command', () => {
  it('is refused with a sentence that says the feature is gone', async () => {
    const game = await harness.client('setup', { role: 'setup' });
    const ack = await game.sendRaw({
      commandId: 'removed-announce-1',
      type: 'announce',
      payload: { text: 'Hello everyone.' },
    });

    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('INVALID');
    expect(ack.message).toBe('Announcements were removed. Say it out loud, or turn messaging on.');
  });
});
