/**
 * C1 in real browsers: the first two minutes of a lesson.
 *
 * The socket version of this is in tests/acceptance/C1-joins.test.ts, which
 * measures the server. This one measures what a room would actually see: nine
 * browsers opening the join page at the same moment, plus the projector and the
 * dashboard, each with its own storage and its own socket.
 */

import { expect, test } from '@playwright/test';
import { GameServer } from './support/server.js';
import { createLesson, openScreen, type Screen } from './support/room.js';

const ALL_CONNECTED_LIMIT_MS = 10_000;
const OWN_COUNTRY_LIMIT_MS = 2_000;

test.describe('C1 - everyone joins at once', () => {
  test('nine terminals, the projector and the dashboard are all in within 10 s', async ({
    browser,
  }) => {
    const server = await GameServer.start();
    const opened: Screen[] = [];

    try {
      const lesson = await createLesson(browser, server, { worlds: 3, preset: 'test-fast' });
      opened.push(lesson.instructor);
      expect(lesson.teams).toHaveLength(9);

      const startedAt = Date.now();

      // Nine join pages and the projector, all opened before any of them is
      // waited on, so the server really does see them arrive together.
      const joins = lesson.teams.map(async (team) => {
        const screen = await openScreen(browser, `${server.url}/join/${team.joinCode}`);
        opened.push(screen);
        const askedAt = Date.now();
        // The link names the code, so the box is already filled in (SPEC 8.2).
        await expect(screen.page.locator('#join-code')).toHaveValue(team.joinCode);
        await screen.page.getByRole('button', { name: 'This is our code' }).click();

        // "You are World 2 - Borvia (B). Is that right?" within two seconds.
        const heading = screen.page.getByRole('heading', {
          name: /^You are World .* Is that right\?$/,
        });
        await expect(heading).toBeVisible({ timeout: OWN_COUNTRY_LIMIT_MS });
        const shown = await heading.innerText();
        return { team, shown, ownCountryMs: Date.now() - askedAt, screen };
      });

      const projectorJoin = (async () => {
        const screen = await openScreen(
          browser,
          `${server.url}/projector/${lesson.sessionId}?k=${lesson.projectorKey}`,
        );
        opened.push(screen);
        await expect(screen.page.locator('.projector-url')).toBeVisible();
        return screen;
      })();

      // A second dashboard, as a teacher with a tablet beside the laptop.
      const secondDashboard = (async () => {
        const screen = await openScreen(
          browser,
          `${server.url}/instructor?s=${lesson.sessionId}&k=${encodeURIComponent(lesson.instructorKey)}`,
        );
        opened.push(screen);
        await expect(
          screen.page.getByRole('heading', { name: 'Step 3 Connect the team computers' }),
        ).toBeVisible();
        return screen;
      })();

      const [joined] = await Promise.all([Promise.all(joins), projectorJoin, secondDashboard]);
      const allConnectedMs = Date.now() - startedAt;

      expect(
        allConnectedMs,
        `the room took ${String(allConnectedMs)} ms to be connected`,
      ).toBeLessThan(ALL_CONNECTED_LIMIT_MS);

      // Each group was shown its own country, and the right one.
      for (const entry of joined) {
        expect(entry.shown).toContain(`World ${String(entry.team.worldNumber)}`);
        expect(entry.shown).toContain(`(${entry.team.letter})`);
        expect(
          entry.ownCountryMs,
          `${entry.team.teamId} waited ${String(entry.ownCountryMs)} ms`,
        ).toBeLessThan(OWN_COUNTRY_LIMIT_MS);
      }
      // Nine different countries, not the same one nine times.
      expect(new Set(joined.map((entry) => entry.shown)).size).toBe(9);

      // And Step 3 of the start screen agrees that all nine are connected.
      await expect(
        lesson.instructor.page.getByText(`${String(lesson.teams.length)} of ${String(lesson.teams.length)} connected`),
      ).toBeVisible();
      await expect(
        lesson.instructor.page.locator('.connect-grid .cell-line', { hasText: 'Connected' }),
      ).toHaveCount(lesson.teams.length);

      const problems = opened.flatMap((screen) => screen.problems);
      expect(problems, `\n${problems.join('\n')}`).toEqual([]);
    } finally {
      for (const screen of opened) await screen.context.close();
      await server.cleanup();
    }
  });
});
