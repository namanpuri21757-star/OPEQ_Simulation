/**
 * The debrief, the projector mirroring and the exports, against a real server.
 *
 * The unit tests prove the numbers. These prove the plumbing: who is sent the
 * debrief and when, that Show on projector changes only the projector, and that
 * a download really arrives over HTTP with the right bytes in it.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import type { DebriefData } from '../../src/shared/debrief.js';
import { EXPORT_FILES } from '../../src/shared/exports.js';
import type { SessionState } from '../../src/shared/state.js';
import { priceNumber, profitNumber, quantityNumber } from '../../src/shared/units.js';
import type { InstructorView, ProjectorView, TeamView } from '../../src/shared/views.js';
import type { GameClient } from '../support/client.js';
import { openGame, playYears, startBetween, endBetween, type OpenGame } from '../support/game.js';
import { startServer, type Harness } from '../support/harness.js';

let harness: Harness;

beforeEach(async () => {
  harness = await startServer();
});

afterEach(async () => {
  await harness.cleanup();
});

/** A short two-world game, played to the end, with something in every file. */
async function playedGame(): Promise<OpenGame> {
  const game = await openGame(harness, {
    settings: {
      worlds: 2,
      years: 3,
      schedule: [{ afterYear: 1, kind: 'chat', seconds: 60 }],
      newProducer: { enabled: false },
      finalYearWarning: false,
    },
  });

  // Practice and Year 1.
  await playYears(game, 1, 383);

  // The chat window after Year 1: one promise, one message, then the rest.
  // The test clock is frozen unless a test moves it, and a promise posted at the
  // same millisecond a year closed would belong to that year rather than the
  // next one, so time passes here the way it would in a classroom.
  harness.clock.advance(1000);
  await startBetween(game, 'chat', 60);
  const first = game.teams[0];
  if (!first) throw new Error('No terminal claimed.');
  await first.must('sendPledge', { tenths: 383 });
  // One message per team every three seconds (SPEC section 6); the test clock
  // is the test's to move.
  harness.clock.advance(4000);
  await first.must('sendMessage', { text: 'Shall we all keep to 38.3?' });
  await endBetween(game);

  // Year 2: huddles and guesses, and Ardonia in world 1 breaks its promise.
  await game.instructor.must('openYear', { year: 2 });
  await game.sync();
  await first.must('recordHuddle', {
    suggestions: [
      { name: 'Ada', tenths: 750 },
      { name: 'Ben', tenths: 383 },
    ],
    reason: 'Nobody can stop us.',
  });
  await first.must('submitDecision', { tenths: 750 });
  for (const team of game.teams.slice(1)) await team.must('submitDecision', { tenths: 383 });
  await first.must('submitPrediction', { othersTenths: [383, 383], trust: 2 });
  await game.instructor.must('closeYear');
  await game.sync();

  await game.instructor.must('openYear', { year: 3 });
  await game.sync();
  for (const team of game.teams) await team.must('submitDecision', { tenths: 400 });
  await game.instructor.must('closeYear');
  await game.sync();

  await game.instructor.must('endGame');
  await first.must('submitReflection', {
    answers: ['Year 1.', 'We broke one.', 'Talk sooner.'],
  });
  await game.sync();
  return game;
}

function dashboard(client: GameClient): InstructorView {
  return client.view as unknown as InstructorView;
}

/**
 * The bytes and the text of one download.
 *
 * Both come from one read: `Response.text()` strips a leading byte-order mark
 * while it decodes, so the only way to see one is to look at the bytes, and a
 * response body can only be read once.
 */
async function fileFrom(res: Response): Promise<{ bom: boolean; text: string }> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  return {
    bom: bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf,
    text: new TextDecoder().decode(bytes),
  };
}

async function download(
  game: OpenGame,
  name: string,
  key = game.session.instructorKey,
): Promise<Response> {
  const path = `/api/sessions/${game.session.sessionId}/export/${name}?k=${encodeURIComponent(key)}`;
  return fetch(`${harness.url}${path}`);
}

describe('who is sent the debrief', () => {
  it('reaches the instructor only once the game has ended', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 1,
        years: 2,
        timers: { earlyYearsThrough: 1 },
        schedule: [],
        newProducer: { enabled: false },
      },
    });
    await playYears(game, 2, 383);
    expect(dashboard(game.instructor).debrief).toBeNull();

    await game.instructor.must('endGame');
    await game.instructor.waitForView((view) => view['debrief'] !== null, 'the debrief to arrive');

    const debrief = dashboard(game.instructor).debrief;
    expect(debrief?.years).toEqual([1, 2]);
    expect(debrief?.worlds[0]?.percentOfMax).toBe(100);
  });

  it('never reaches a team terminal', async () => {
    const game = await playedGame();
    for (const team of game.teams) {
      const view = team.view as unknown as TeamView;
      expect('debrief' in view).toBe(false);
      expect(JSON.stringify(team.views)).not.toContain('cooperativeMaxK');
    }
  });
});

describe('Show on projector', () => {
  it('changes the projector and nothing else', async () => {
    const game = await playedGame();
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    await projector.waitForView(() => true, 'the first projector view');

    const before = projector.view as unknown as ProjectorView;
    expect(before.debrief).toBeNull();
    expect(before.screen).toBe('auto');

    const teamVersionBefore = (game.teams[0]?.view['version'] as number) ?? 0;

    await game.instructor.must('setProjectorScreen', { screen: 'worldDetail', worldNumber: 2 });
    await projector.waitForView(
      (view) => view['screen'] === 'worldDetail',
      'the projector to follow',
    );

    const after = projector.view as unknown as ProjectorView;
    expect(after.screen).toBe('worldDetail');
    expect(after.worldNumber).toBe(2);
    expect(after.debrief?.worlds).toHaveLength(2);

    // The terminals were sent a new version too (the session changed), but what
    // they are shown is unchanged: no debrief, no other world.
    const teamView = game.teams[0]?.view as unknown as TeamView;
    expect((teamView.version as number) >= teamVersionBefore).toBe(true);
    expect('debrief' in teamView).toBe(false);
  });

  it('forgets the world when another screen is sent', async () => {
    const game = await playedGame();
    await game.instructor.must('setProjectorScreen', { screen: 'worldDetail', worldNumber: 2 });
    await game.instructor.waitForView(
      (view) => view['projectorWorldNumber'] === 2,
      'the world to stick',
    );
    await game.instructor.must('setProjectorScreen', { screen: 'leaderboard' });
    await game.instructor.waitForView(
      (view) => view['projectorScreen'] === 'leaderboard',
      'the screen to change',
    );
    expect(dashboard(game.instructor).projectorWorldNumber).toBeNull();
  });

  it('is refused from a team terminal', async () => {
    const game = await playedGame();
    const ack = await game.teams[0]?.send('setProjectorScreen', { screen: 'leaderboard' });
    expect(ack?.ok).toBe(false);
  });

  it('keeps the debrief off the projector while a game is still running', async () => {
    const game = await openGame(harness, {
      settings: {
        worlds: 1,
        years: 2,
        timers: { earlyYearsThrough: 1 },
        schedule: [],
        newProducer: { enabled: false },
      },
    });
    await playYears(game, 1, 383);
    const projector = await harness.client('projector', {
      role: 'projector',
      sessionId: game.session.sessionId,
      projectorKey: game.session.projectorKey,
    });
    await game.instructor.must('setProjectorScreen', { screen: 'leaderboard' });
    await projector.waitForView(
      (view) => view['screen'] === 'leaderboard',
      'the projector to follow',
    );
    expect((projector.view as unknown as ProjectorView).debrief).toBeNull();
  });
});

describe('the exports', () => {
  it('need the instructor key', async () => {
    const game = await playedGame();
    expect((await download(game, 'decisions', 'not-the-key')).status).toBe(403);
    expect((await download(game, 'decisions', game.session.projectorKey)).status).toBe(403);
    expect((await download(game, 'homework')).status).toBe(404);

    const missing = await fetch(
      `${harness.url}/api/sessions/nope/export/decisions?k=${game.session.instructorKey}`,
    );
    expect(missing.status).toBe(404);
  });

  it('arrive as files a spreadsheet opens', async () => {
    const game = await playedGame();
    for (const file of EXPORT_FILES) {
      const res = await download(game, file.name);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toBe(file.contentType);
      expect(res.headers.get('content-disposition')).toContain(file.fileName);

      const { bom, text } = await fileFrom(res);
      if (file.contentType.startsWith('text/csv')) {
        // A byte-order mark, a header row, and CRLF line endings.
        expect(bom, `${file.name} has no byte-order mark`).toBe(true);
        expect(text).toContain('\r\n');
        expect(text.split('\r\n')[0]).toContain('World');
      } else {
        expect(bom).toBe(false);
        expect(() => JSON.parse(text) as unknown).not.toThrow();
      }
    }
  });

  it('hold every year and every country, matching what the server stored', async () => {
    const game = await playedGame();
    const state = harness.server.store.get(game.session.sessionId) as SessionState;
    const body = await (await download(game, 'outcomes')).text();
    const rows = body
      .trim()
      .split('\r\n')
      .slice(1)
      .map((row) => row.split(','));

    // Two worlds, a practice year plus three scored years, three countries.
    expect(rows).toHaveLength(2 * 4 * 3);

    for (const world of state.worlds) {
      const records = world.practice ? [world.practice, ...world.years] : world.years;
      for (const record of records) {
        for (const letter of COUNTRY_LETTERS) {
          const row = rows.find(
            (cells) =>
              cells[0] === String(world.worldNumber) &&
              cells[1] === String(record.year) &&
              cells[3] === (record.isPractice ? 'yes' : 'no') &&
              cells[4] === letter,
          );
          expect(
            row,
            `no row for world ${String(world.worldNumber)} year ${String(record.year)}`,
          ).toBeDefined();
          expect(row?.[6]).toBe(quantityNumber(record.outcome.countries[letter].actualTenths));
          expect(row?.[7]).toBe(priceNumber(record.outcome.priceCents));
          expect(row?.[8]).toBe(profitNumber(record.outcome.countries[letter].profitK));
        }
      }
    }
  });

  it('hold the messages, promises, guesses, huddles and reflections', async () => {
    const game = await playedGame();

    const messages = await (await download(game, 'messages')).text();
    expect(messages).toContain('Shall we all keep to 38.3?');
    // The promise was 38.3 and Ardonia produced 75.0, so it is marked broken.
    expect(messages).toContain('pledge');
    expect(messages).toMatch(/38\.3,75\.0,no/);

    const predictions = await (await download(game, 'predictions')).text();
    expect(predictions.trim().split('\r\n')).toHaveLength(2);
    expect(predictions).toContain('Trust (1 to 5)');

    const huddles = await (await download(game, 'huddles')).text();
    expect(huddles).toContain('Ada');
    expect(huddles).toContain('Nobody can stop us.');

    const reflections = await (await download(game, 'reflections')).text();
    expect(reflections).toContain('When did your world cooperate best, and why?');
    expect(reflections).toContain('Talk sooner.');
  });

  it('carry no key and no terminal token', async () => {
    const game = await playedGame();
    const state = harness.server.store.get(game.session.sessionId) as SessionState;
    const tokens = Object.values(state.teams)
      .map((team) => team.token)
      .filter((token): token is string => token !== null);

    for (const file of EXPORT_FILES) {
      const body = await (await download(game, file.name)).text();
      expect(body).not.toContain(state.instructorKey);
      expect(body).not.toContain(state.projectorKey);
      for (const token of tokens) expect(body).not.toContain(token);
    }
  });

  it('agree with the debrief the dashboard is showing', async () => {
    const game = await playedGame();
    await game.instructor.waitForView((view) => view['debrief'] !== null, 'the debrief to arrive');
    const debrief = dashboard(game.instructor).debrief as DebriefData;

    const json = JSON.parse(await (await download(game, 'session')).text()) as {
      debrief: DebriefData;
    };
    expect(json.debrief.titles).toEqual(debrief.titles);
    expect(json.debrief.worlds.map((world) => world.percentOfMax)).toEqual(
      debrief.worlds.map((world) => world.percentOfMax),
    );
  });
});
