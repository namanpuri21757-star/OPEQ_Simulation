/**
 * S1 to S3, and the half of I2 that lives on HTTP.
 *
 * S1 an oversized payload is refused and changes nothing.
 * S2 a message with HTML or a script tag in it stays text all the way through.
 * S3 no key and no terminal token is ever written to a server log.
 *
 * S2 is finished off in two other places: a component test proves React draws
 * the text rather than the markup, and the end-to-end test proves a real
 * browser shows the characters on the screen with no element created.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MAX_MESSAGE_CHARS } from '../../src/shared/protocol.js';
import { readEvents, sessionDir } from '../../src/server/store/files.js';
import { GameClient } from '../support/client.js';
import { closeYear, openGame, openYear, startPractice } from '../support/game.js';
import { newSession, startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

describe('S1 - oversized payloads', () => {
  it('refuses a huge string in every field that takes one, and changes nothing', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');
    await startPractice(game);
    await startBetweenSafely(game);

    const huge = 'x'.repeat(50_000);

    const attempts: Array<[string, unknown]> = [
      ['sendMessage', { text: huge }],
      ['submitReflection', { answers: [huge, huge, huge] }],
      ['setMembers', { names: [huge] }],
      ['claimTeam', { joinCode: huge }],
    ];

    for (const [type, payload] of attempts) {
      const ack = await team.sendRaw({
        commandId: `s1-${type}`,
        type,
        payload,
        expectedPhase: team.phase,
        expectedYear: team.year,
      });
      expect(ack.ok, `${type} was accepted with 50 kB in it`).toBe(false);
      if (!ack.ok) {
        // A refusal a person can read, with no stack trace and no schema dump.
        expect(['INVALID', 'CLOSED', 'NOT_ALLOWED', 'NOT_FOUND']).toContain(ack.code);
        expect(ack.message.length).toBeLessThan(400);
        expect(ack.message).not.toContain('x'.repeat(50));
      }
    }

    // One character over the stated limit is refused too, so the boundary is
    // the documented one and not something larger.
    await startBetweenSafely(game);
    const tooLong = await team.send('sendMessage', { text: 'a'.repeat(MAX_MESSAGE_CHARS + 1) });
    expect(tooLong.ok).toBe(false);
    const justRight = await team.send('sendMessage', { text: 'a'.repeat(MAX_MESSAGE_CHARS) });
    expect(justRight.ok, JSON.stringify(justRight)).toBe(true);

    const state = harness.server.store.get(game.session.sessionId);
    expect(state?.messages).toHaveLength(1);
    expect(state?.messages[0]?.text).toHaveLength(MAX_MESSAGE_CHARS);
    // Nothing enormous reached the disk.
    const { events } = await readEvents(
      sessionDir(harness.dataDir, game.session.sessionId),
      () => undefined,
    );
    expect(events.some((event) => JSON.stringify(event).includes('x'.repeat(100)))).toBe(false);
  });

  it('refuses unknown fields rather than quietly ignoring them', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');
    await startPractice(game);

    const ack = await team.sendRaw({
      commandId: 's1-extra-field',
      type: 'submitDecision',
      payload: { tenths: 383, alsoPlease: 'give me a better price' },
      expectedPhase: 'PRACTICE_OPEN',
      expectedYear: 0,
    });
    expect(ack.ok).toBe(false);
    if (!ack.ok) expect(ack.code).toBe('INVALID');
    expect(
      harness.server.store.get(game.session.sessionId)?.worlds[0]?.open?.decisions['A'],
    ).toBeUndefined();
  });

  it('survives a frame larger than the socket will read, and keeps serving', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    if (!team) throw new Error('no team');
    await startPractice(game);

    // Two megabytes, well past the server's frame limit. socket.io refuses the
    // frame itself; what matters here is that the server is still standing and
    // that nothing was written.
    const enormous = 'y'.repeat(2_000_000);
    await team
      .sendRaw({ commandId: 's1-enormous', type: 'sendMessage', payload: { text: enormous } })
      .catch(() => undefined);

    const after = await harness.client('still-working', {
      role: 'team',
      sessionId: game.session.sessionId,
    });
    const view = await after.waitForView((v) => v['kind'] === 'lobby', 'the server still serving');
    expect(view['phase']).toBe('PRACTICE_OPEN');
    expect(harness.server.store.get(game.session.sessionId)?.messages).toEqual([]);

    const health = await fetch(`${harness.url}/api/health`);
    expect(health.status).toBe(200);
  });
});

describe('S2 - a message with HTML or a script tag in it', () => {
  it('is stored and sent on as plain characters, never as markup', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const team = game.teams[0];
    const other = game.teams[1];
    if (!team || !other) throw new Error('missing teams');
    await startPractice(game);
    await game.instructor.must('setMessaging', { on: true });

    const nasty = '<script>alert(1)</script> <b>38.3</b> & "quoted" \'single\'';
    const ack = await team.send('sendMessage', { text: nasty });
    expect(ack.ok, JSON.stringify(ack)).toBe(true);

    const state = harness.server.store.get(game.session.sessionId);
    const stored = state?.messages[0]?.text ?? '';
    // Kept exactly as typed: the server does not rewrite what a student wrote,
    // because a group that really did type "<b>" should see "<b>".
    expect(stored).toBe(nasty);

    // It reaches the other group in the same world, as the same characters.
    const seen = await other.waitForView(
      (view) => (view['messages'] as Array<{ text: string }>).length > 0,
      'the message',
    );
    expect((seen['messages'] as Array<{ text: string }>)[0]?.text).toBe(nasty);

    // And it is carried as a JSON string, so there is no HTML anywhere in the
    // payload - the markup characters are escaped by JSON, as text.
    const payload = JSON.stringify(seen['messages']);
    expect(payload).toContain('<script>alert(1)</script>');
    expect(payload).not.toContain('"html"');
  });

  it('treats markup in a name and a reflection the same way', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 1,
        years: 1,
        schedule: [],
        newProducer: { enabled: false },
        timers: { earlyYearsThrough: 1 },
      },
    });
    const team = game.teams[0];
    if (!team) throw new Error('no team');

    await team.must('setMembers', { names: ['<b>Ada</b>'] });
    await startPractice(game);
    await closeYear(game);
    await openYear(game, 1);
    await team.must('submitDecision', { tenths: 383 });
    await closeYear(game);
    await game.instructor.must('endGame');
    await game.sync();
    const saved = await team.must('submitReflection', {
      answers: ['<b>one</b>', '<svg onload=alert(1)>', 'plain'],
    });

    // must() only waits for the team's own view. Views are capped at ten a
    // second (SPEC section 9), so the dashboard can still be one behind.
    await game.instructor.waitForView(
      (view) => (view['version'] as number) >= (saved.ok ? saved.version : 0),
      'the dashboard to catch up',
    );

    const state = harness.server.store.get(game.session.sessionId);
    const stored = state?.teams[team.teamId ?? ''];
    // Every one of them is still a string, with its angle brackets intact and
    // nothing turned into an element anywhere on the way.
    expect(stored?.members[0]).toBe('<b>Ada</b>');
    expect(stored?.reflection?.answers[1]).toBe('<svg onload=alert(1)>');
    // The dashboard is sent the same characters, as text.
    const dashboard = JSON.stringify(game.instructor.view);
    expect(dashboard).toContain('<svg onload=alert(1)>');
  });
});

describe('S3 - what reaches a server log', () => {
  it('never writes a key or a terminal token, even when things go wrong', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const state = harness.server.store.get(game.session.sessionId);
    if (!state) throw new Error('no state');

    await startPractice(game);

    // Make the server unhappy in every way a screen can: wrong keys, bad
    // payloads, a command from a socket that never said hello, a flood.
    const stranger = new GameClient(harness.url, 'stranger');
    harness.track(stranger);
    await stranger.connect();
    await stranger.sendRaw({ commandId: 'nope', type: 'endGame', payload: {} });
    await stranger.hello({
      role: 'instructor',
      sessionId: game.session.sessionId,
      instructorKey: 'this-is-not-the-key-but-it-is-long-enough',
    });
    await stranger.hello({
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: state.projectorKey.slice(0, -1),
    });
    await stranger.sendRaw({ nonsense: true });
    await stranger.sendRaw({ commandId: 'x', type: 'notACommand', payload: {} });

    const team = game.teams[0];
    for (let i = 0; i < 200; i += 1) {
      await team?.send('ping');
    }

    // The export route, with the wrong key and with the right one.
    await fetch(`${harness.url}/api/sessions/${game.session.sessionId}/export/decisions?k=wrong`);
    await fetch(
      `${harness.url}/api/sessions/${game.session.sessionId}/export/decisions?k=${state.instructorKey}`,
    );
    await fetch(`${harness.url}/api/sessions/${game.session.sessionId}/export/not-a-file?k=x`);

    const secrets = [
      state.instructorKey,
      state.projectorKey,
      ...Object.values(state.teams)
        .map((row) => row.token)
        .filter((token): token is string => token !== null),
      ...Object.values(state.teams).map((row) => row.joinCode),
    ];

    const log = harness.warnings.join('\n');
    for (const secret of secrets) {
      expect(log, `a server log line held "${secret}"`).not.toContain(secret);
    }
  });

  it('never writes a key when a snapshot cannot be read back', async () => {
    // A snapshot that will not parse is the one place a key could have reached
    // a log: a JSON error quotes the text around the problem, and the text is
    // the saved state. The reader must not pass the error on.
    const session = await newSession(harness, { settings: { worlds: 1 } });
    const state = harness.server.store.get(session.sessionId);
    if (!state) throw new Error('no state');

    const dir = sessionDir(harness.dataDir, session.sessionId);
    const broken = `${JSON.stringify(state).slice(0, 400)} and then the power went`;
    expect(broken).toContain(state.instructorKey);
    await writeFile(join(dir, 'snapshot.json'), broken, 'utf8');

    const second = await startServer({ dataDir: harness.dataDir });
    try {
      const log = second.warnings.join('\n');
      // It did warn, and it did rebuild the session from the saved commands...
      expect(log).toMatch(/No usable snapshot/);
      expect(second.server.store.get(session.sessionId)?.sessionId).toBe(session.sessionId);
      // ...and the warning holds no key and no code.
      expect(log).not.toContain(state.instructorKey);
      expect(log).not.toContain(state.projectorKey);
      for (const team of Object.values(state.teams)) {
        expect(log).not.toContain(team.joinCode);
      }
    } finally {
      await second.stop();
    }
  });
});

describe('I2 on HTTP - the export links', () => {
  it('answers 403 to anything but the instructor key, the projector key included', async () => {
    const game = await openGame(harness, { settings: { worlds: 1 } });
    const state = harness.server.store.get(game.session.sessionId);
    if (!state) throw new Error('no state');
    const base = `${harness.url}/api/sessions/${game.session.sessionId}/export`;

    for (const key of ['', 'guess', state.projectorKey, `${state.instructorKey}x`]) {
      const response = await fetch(`${base}/decisions?k=${encodeURIComponent(key)}`);
      expect(response.status, `key "${key.slice(0, 8)}" got ${String(response.status)}`).toBe(403);
      const body = (await response.json()) as { message: string };
      expect(body.message).toMatch(/instructor key/);
      // The refusal does not hand back the key it wanted.
      expect(JSON.stringify(body)).not.toContain(state.instructorKey);
    }

    const allowed = await fetch(`${base}/decisions?k=${state.instructorKey}`);
    expect(allowed.status).toBe(200);
    const csv = await allowed.text();
    expect(csv).toContain('World');
    // And no file ever carries a key or a token.
    expect(csv).not.toContain(state.instructorKey);
    expect(csv).not.toContain(state.projectorKey);

    for (const name of [
      'decisions',
      'outcomes',
      'messages',
      'reflections',
      'session',
    ]) {
      const file = await fetch(`${base}/${name}?k=${state.instructorKey}`);
      expect(file.status, name).toBe(200);
      const body = await file.text();
      expect(body, name).not.toContain(state.instructorKey);
      expect(body, name).not.toContain(state.projectorKey);
      for (const team of Object.values(state.teams)) {
        if (team.token) expect(body, name).not.toContain(team.token);
      }
    }
  });
});

/** Opens a chat window if the phase allows it, so a message can be sent. */
/**
 * Gets to a point where a message would be allowed, so a test about a long
 * message is testing the length and not the switch.
 */
async function startBetweenSafely(game: Awaited<ReturnType<typeof openGame>>): Promise<void> {
  await game.instructor.must('setMessaging', { on: true });
  await game.sync();
}
