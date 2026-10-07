/**
 * The client's connection layer against the real server.
 *
 * This is the one test that drives src/client/net the way a browser does: it
 * says hello, claims a country, submits a decision, is cut off mid-command and
 * comes back. The promise that matters most is the last one: a command that was
 * in the air when the network dropped is sent again with the SAME commandId, and
 * the server treats it as the repeat it is (SPEC section 9).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Connection } from '../../src/client/net/connection.js';
import { memoryStore, readTerminal, type KeyValueStore } from '../../src/client/net/storage.js';
import type { ClaimTeamResult } from '../../src/shared/protocol.js';
import type { TeamView } from '../../src/shared/views.js';
import { newSession, startServer, type Harness, type Session } from '../support/harness.js';

let harness: Harness;
let session: Session;
let store: KeyValueStore;
let conn: Connection;

async function until(what: string, predicate: () => boolean, timeoutMs = 15000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > until) throw new Error(`gave up waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const view = (): TeamView | null => conn.getSnapshot().view as TeamView | null;

/** Claims a country and waits until the terminal is holding a team view. */
async function claimFirstTeam(): Promise<ClaimTeamResult> {
  const team = session.teams[0];
  if (!team) throw new Error('the session has no teams.');
  const ack = await conn.sendCommand('claimTeam', { joinCode: team.joinCode });
  if (!ack.ok) throw new Error(`claim refused: ${ack.message}`);
  const result = ack.result as ClaimTeamResult;
  conn.remember(result);
  await until('a team view', () => view()?.kind === 'team');
  return result;
}

/** Moves the session on to the open practice year. */
async function openPractice(): Promise<void> {
  await session.instructor.must('setBriefingSlide', { slide: 0 });
  await session.instructor.must('startPractice');
  await until('the practice year to open', () => view()?.phase === 'PRACTICE_OPEN');
}

beforeEach(async () => {
  harness = await startServer({ tickMs: 0 });
  session = await newSession(harness);
  store = memoryStore();
  conn = new Connection({
    sessionId: session.sessionId,
    role: 'team',
    url: harness.url,
    store,
  });
  conn.start();
  // Online and holding its first view: the status arrives with the hello ack
  // and the view in the message after it, so waiting for the status alone
  // leaves the first assertion racing the first broadcast.
  await until(
    'the connection to come online with a view',
    () => conn.getSnapshot().status === 'online' && conn.getSnapshot().view !== null,
  );
});

afterEach(async () => {
  conn.stop();
  await harness.cleanup();
});

describe('the client connection layer', () => {
  it('says hello, and is told it has no country yet', () => {
    const snapshot = conn.getSnapshot();
    expect(snapshot.needsClaim).toBe(true);
    expect(snapshot.teamId).toBeNull();
    expect((snapshot.view as { kind?: string } | null)?.kind).toBe('lobby');
  });

  it('works out the server’s clock rather than trusting its own', () => {
    // The test server runs on a clock of its own, so an offset that was not
    // being measured would be out by years, not milliseconds.
    expect(Math.abs(conn.serverNow() - harness.clock.now())).toBeLessThan(2000);
  });

  it('claims a country, remembers the token and gets its own view', async () => {
    const result = await claimFirstTeam();

    // The screen has to stop asking for a join code the moment the claim lands.
    expect(conn.getSnapshot().needsClaim).toBe(false);
    expect(conn.getSnapshot().teamId).toBe(result.teamId);
    expect(readTerminal(store)).toEqual({
      sessionId: session.sessionId,
      teamId: result.teamId,
      token: result.token,
      label: result.label,
    });
    const team = view();
    expect(team?.kind).toBe('team');
    expect(team?.teamId).toBe(result.teamId);
    expect(team?.label).toBe(result.label);
  });

  it('comes back as the same country after a reconnect, with its token', async () => {
    const result = await claimFirstTeam();

    harness.server.io.disconnectSockets(true);
    await until('the drop to show', () => conn.getSnapshot().status === 'offline');
    await until('the connection to come back', () => conn.getSnapshot().status === 'online');

    expect(conn.getSnapshot().teamId).toBe(result.teamId);
    expect(conn.getSnapshot().needsClaim).toBe(false);
    await until('a team view again', () => view()?.kind === 'team');
  });

  it('fills in the staleness guards from the view it is looking at', async () => {
    await claimFirstTeam();
    await openPractice();

    // The guards are not passed in here; the connection takes them from the
    // view, which is what makes a click on a stale screen safe.
    const ack = await conn.sendCommand('submitDecision', { tenths: 383 });
    expect(ack.ok).toBe(true);
    await until('the decision to come back', () => view()?.decision?.tenths === 383);
  });

  it('is refused, kindly, when the screen is behind the game', async () => {
    await claimFirstTeam();
    await openPractice();

    const ack = await conn.sendCommand('submitDecision', { tenths: 383 }, { expectedYear: 4 });
    expect(ack.ok).toBe(false);
    if (ack.ok) return;
    expect(ack.code).toBe('STALE');
    expect(ack.message.length).toBeGreaterThan(0);
  });

  it('never applies the same commandId twice', async () => {
    await claimFirstTeam();
    await openPractice();

    const commandId = 'decision-repeat-0001';
    const first = await conn.sendCommand('submitDecision', { tenths: 383 }, { commandId });
    expect(first.ok).toBe(true);

    // The same id with a different number: the server has to answer with what it
    // did the first time and change nothing.
    const again = await conn.sendCommand('submitDecision', { tenths: 500 }, { commandId });
    expect(again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.version).toBe(first.version);

    const state = harness.server.store.get(session.sessionId);
    const open = state?.worlds[0]?.open;
    expect(open?.decisions['A']?.tenths).toBe(383);
  });

  it('holds a command sent while offline and sends it when it is back', async () => {
    await claimFirstTeam();
    await openPractice();

    harness.server.io.disconnectSockets(true);
    await until('the drop to show', () => conn.getSnapshot().status === 'offline');

    // Nothing is lost and nothing is thrown: the command waits in the outbox.
    const pending = conn.sendCommand(
      'submitDecision',
      { tenths: 421 },
      { commandId: 'decision-after-drop-0001' },
    );
    expect(conn.getSnapshot().pending).toBe(1);

    const ack = await pending;
    expect(ack.ok).toBe(true);
    expect(conn.getSnapshot().pending).toBe(0);
    await until('the decision to come back', () => view()?.decision?.tenths === 421);
  });

  it('resending after a reconnect does not produce a second decision', async () => {
    await claimFirstTeam();
    await openPractice();

    const commandId = 'decision-resend-0001';
    const first = await conn.sendCommand('submitDecision', { tenths: 383 }, { commandId });
    expect(first.ok).toBe(true);

    harness.server.io.disconnectSockets(true);
    await until('the drop to show', () => conn.getSnapshot().status === 'offline');
    await until('the connection to come back', () => conn.getSnapshot().status === 'online');

    // This is the case the outbox exists for: the ack may have been lost in the
    // drop, so the client asks again with the same id after reconnecting.
    const again = await conn.sendCommand('submitDecision', { tenths: 383 }, { commandId });
    expect(again.ok).toBe(true);
    if (!first.ok || !again.ok) return;
    expect(again.version).toBe(first.version);

    const state = harness.server.store.get(session.sessionId);
    const events = state?.resultOrder.filter((id) => id === commandId) ?? [];
    expect(events).toHaveLength(1);
  });

  it('tells the screen when hello itself is refused', async () => {
    const wrong = new Connection({
      sessionId: 'no-such-session',
      role: 'team',
      url: harness.url,
      store: memoryStore(),
    });
    wrong.start();
    try {
      await until('the refusal', () => wrong.getSnapshot().status === 'refused');
      expect(wrong.getSnapshot().problem).toBe('That session is not open on this computer.');
    } finally {
      wrong.stop();
    }
  });
});
