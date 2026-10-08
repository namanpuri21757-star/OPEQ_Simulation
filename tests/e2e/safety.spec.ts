/**
 * S2 in a real browser: a message with HTML in it is read, not run.
 *
 * The socket half of this is in tests/acceptance/S-safety.test.ts, which proves
 * the server stores and forwards the characters exactly as typed. This is the
 * other half, and the one that matters to a classroom: what the other groups
 * see on the screen is the characters, no element is created, and no script
 * runs.
 *
 * It is tested through the messages panel because that is the only place one group's
 * typing reaches another group's screen.
 */

import { expect, test } from '@playwright/test';
import { GameServer } from './support/server.js';
import { claimTeam, createLesson, pressBigButton, pressUntil } from './support/room.js';

/** Several shapes of markup, because they fail in different ways. */
const ATTEMPTS = [
  '<script>window.__ranScript = true;</script>',
  '<img src=x onerror="window.__ranImage = true">',
  '<b>bold</b> &amp; <i>italic</i>',
  '</p><div id="injected">out of the paragraph</div>',
];

test.describe('S2 - markup in a message', () => {
  test('shows as plain characters on every screen, and nothing runs', async ({ browser }) => {
    const server = await GameServer.start();

    try {
      const lesson = await createLesson(browser, server, {
        worlds: 1,
        preset: 'test-fast',
        timerSeconds: 900,
        activitySeconds: 900,
      });
      const dash = lesson.instructor.page;

      const terminals = [];
      for (const team of lesson.teams) {
        terminals.push(await claimTeam(browser, lesson, team, ['Ada']));
      }
      const writer = terminals[0];
      const reader = terminals[1];
      if (!writer || !reader) throw new Error('missing terminals');

      // Turn messaging on, which is the only time a group may write.
      await pressUntil(dash, /^Start the practice year$/);
      await pressBigButton(dash);
      await pressUntil(dash, /^Close the practice year$/);
      await pressBigButton(dash);
      await pressUntil(dash, /^Turn messaging on/);
      await pressBigButton(dash);
      await expect(writer.page.locator('.messages-state')).toContainText('Messaging is on');

      for (const [index, attempt] of ATTEMPTS.entries()) {
        // One message per three seconds per team (SPEC section 6), so the
        // attempts are shared out between the two groups that can write.
        const from = index % 2 === 0 ? writer : reader;
        const to = index % 2 === 0 ? reader : writer;

        await from.page.getByLabel('Write to the other countries in your world').fill(attempt);
        await from.page.getByRole('button', { name: 'Send', exact: true }).click();

        // The other group sees the characters, exactly as typed.
        const line = to.page.locator('.message-text', { hasText: attempt.slice(0, 20) });
        await expect(line).toBeVisible();
        await expect(line).toHaveText(attempt);

        // And no element was made out of it on either screen.
        for (const screen of [from, to, lesson.instructor]) {
          expect(
            await screen.page.locator('#injected').count(),
            'a div from a message was added to the page',
          ).toBe(0);
          expect(
            await screen.page
              .locator('.message-text b, .message-text i, .message-text img')
              .count(),
            'markup from a message became an element',
          ).toBe(0);
          expect(await screen.page.evaluate(() => '__ranScript' in window)).toBe(false);
          expect(await screen.page.evaluate(() => '__ranImage' in window)).toBe(false);
        }

        // Wait out the one-message-per-three-seconds rule before the next one.
        await from.page.waitForTimeout(3100);
      }

      // The dashboard's message feed shows them as characters too.
      for (const attempt of ATTEMPTS) {
        await expect(dash.locator('.feed')).toContainText(attempt);
      }

      const problems = [writer, reader, lesson.instructor].flatMap((screen) => screen.problems);
      expect(problems, `\n${problems.join('\n')}`).toEqual([]);

      for (const terminal of terminals) await terminal.context.close();
      await lesson.instructor.context.close();
    } finally {
      await server.cleanup();
    }
  });
});
