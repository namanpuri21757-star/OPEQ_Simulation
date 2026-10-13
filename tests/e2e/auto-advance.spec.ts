/**
 * The game moves on by itself (autoAdvance), in real browsers.
 *
 * One world of three terminals. Nobody presses Close or Start: once every
 * country has submitted, the year closes, the results stay up for a few
 * seconds, and the next year opens on every terminal and on the dashboard.
 */

import { expect, test } from '@playwright/test';
import { GameServer } from './support/server.js';
import {
  bigButtonLabel,
  claimTeam,
  createLesson,
  pressBigButton,
  pressUntil,
  submitDecision,
  waitForYear,
  type TeamScreen,
} from './support/room.js';

test.describe('moving on by itself', () => {
  test('closes when everyone has submitted and opens the next year', async ({ browser }) => {
    const server = await GameServer.start();
    const terminals: TeamScreen[] = [];
    let lesson: Awaited<ReturnType<typeof createLesson>> | null = null;

    try {
      lesson = await createLesson(browser, server, {
        worlds: 1,
        preset: 'test-fast',
        timerSeconds: 900,
        autoAdvance: true,
      });
      const dash = lesson.instructor.page;
      for (const team of lesson.teams) terminals.push(await claimTeam(browser, lesson, team));

      await pressUntil(dash, /^Start the practice year$/);
      await pressBigButton(dash);
      await Promise.all(terminals.map((terminal) => waitForYear(terminal, 'PRACTICE')));

      for (const year of ['PRACTICE', 'Year 1']) {
        // The first two show their "Submitted" line. The last one closes the
        // year at once, so it goes straight to the results instead.
        const [last, ...others] = [...terminals].reverse();
        if (!last) throw new Error('no terminal');
        for (const terminal of others) await submitDecision(terminal, '38.3');
        await last.page.getByRole('textbox', { name: 'Million barrels' }).fill('38.3');
        await last.page.getByRole('button', { name: /^Submit( the new number)?$/ }).click();
        await last.page.getByRole('dialog').getByRole('button', { name: 'Yes, submit' }).click();

        // The results, then the countdown to the next year, with no button pressed.
        await Promise.all(
          terminals.map((terminal) =>
            expect(terminal.page.getByText(/starts by itself in/)).toBeVisible(),
          ),
        );
        const next = year === 'PRACTICE' ? 'Year 1' : 'Year 2';
        await Promise.all(terminals.map((terminal) => waitForYear(terminal, next)));
        expect(await bigButtonLabel(dash)).toBe(`Close ${next}`);
      }

      const saved = await server.savedState(lesson.sessionId);
      expect(saved.year).toBe(2);
      expect(saved.worlds[0]?.years).toHaveLength(1);
    } finally {
      for (const terminal of terminals) await terminal.context.close();
      if (lesson) await lesson.instructor.context.close();
      await server.cleanup();
    }
  });
});
