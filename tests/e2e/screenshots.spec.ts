/**
 * Every main screen, photographed, so a person can check the design without
 * running a lesson (PROMPT 9 part 7.4).
 *
 * The images go to docs/screenshots/v2/. They are not compared with anything:
 * the point is that a reviewer can open the folder and read the screens, which
 * is the only way to tell whether a layout is clear. What this spec does
 * guarantee is that each screen renders, at the size it is meant for, with real
 * data behind it and no console error anywhere.
 *
 * 1280 x 800 for the terminal and the teacher, 1920 x 1080 for the projector,
 * which is the shape of a classroom projector.
 */

import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { GameServer } from './support/server.js';
import {
  allProblems,
  bigButtonLabel,
  claimTeam,
  createLesson,
  openScreen,
  openTab,
  pressBigButton,
  pressUntil,
  submitDecision,
  waitForYear,
  type Screen,
  type TeamScreen,
} from './support/room.js';

const DIR = 'docs/screenshots/v2';
const DESK = { width: 1280, height: 800 };
const WALL = { width: 1920, height: 1080 };

async function shoot(screen: Screen, name: string): Promise<void> {
  // The page is settled by the assertions each step makes before it gets here,
  // so a full-page shot is what a reviewer wants: the whole screen, scrolled.
  await screen.page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

test.describe('the screens of v2', () => {
  test('photographs every main screen into docs/screenshots/v2', async ({ browser }) => {
    await mkdir(DIR, { recursive: true });
    const server = await GameServer.start();
    const terminals: TeamScreen[] = [];
    let projector: Screen | null = null;
    let lesson: Awaited<ReturnType<typeof createLesson>> | null = null;

    try {
      lesson = await createLesson(browser, server, {
        worlds: 3,
        preset: 'test-fast',
        timerSeconds: 900,
        activitySeconds: 900,
      });
      const dash = lesson.instructor.page;
      await dash.setViewportSize(DESK);

      // --- 1. the teacher's start screen -----------------------------------

      await expect(dash.getByRole('heading', { name: 'Step 1 Print team cards' })).toBeVisible();
      await shoot(lesson.instructor, 'teacher-start');

      // The printable cards, which are a page of their own. It is a tab in the
      // teacher's own browser, because that is where the session is remembered.
      const cards = await openTab(lesson.instructor, `${server.url}/instructor/cards`);
      await cards.page.setViewportSize(DESK);
      await expect(cards.page.locator('.card').first()).toBeVisible();
      await shoot(cards, 'teacher-cards');
      await cards.page.close();

      // --- the room joins --------------------------------------------------

      projector = await openScreen(
        browser,
        `${server.url}/projector/${lesson.sessionId}?k=${lesson.projectorKey}`,
      );
      await projector.page.setViewportSize(WALL);
      await expect(projector.page.locator('.projector-url')).toContainText('/join');
      await shoot(projector, 'projector-lobby');

      for (const team of lesson.teams) {
        const terminal = await claimTeam(browser, lesson, team, ['Jack', 'Jared']);
        await terminal.page.setViewportSize(DESK);
        terminals.push(terminal);
      }
      const first = terminals[0];
      const second = terminals[1];
      if (!first || !second) throw new Error('no terminals');

      // Step 3 of the start screen, now that nine computers are on.
      await expect(dash.getByText('Every computer is connected.')).toBeVisible();
      await shoot(lesson.instructor, 'teacher-start-connected');

      // --- 2. the briefing -------------------------------------------------

      await pressBigButton(dash);
      await expect(dash.getByRole('group', { name: 'Where the game is' })).toContainText(
        'BRIEFING',
      );
      await shoot(lesson.instructor, 'teacher-live-briefing');

      await expect(first.page.getByText('Briefing · Screen 1 of 4')).toBeVisible();
      await shoot(first, 'terminal-briefing-story');

      await pressUntil(dash, /^Start the practice year$/);
      await expect(first.page.getByText('Briefing · Screen 4 of 4')).toBeVisible();
      await shoot(first, 'terminal-briefing-year');

      // --- 3. the practice year and Year 1 ---------------------------------

      await pressBigButton(dash);
      await Promise.all(terminals.map((terminal) => waitForYear(terminal, 'PRACTICE')));
      await shoot(first, 'terminal-practice');

      for (const [index, terminal] of terminals.entries()) {
        await submitDecision(terminal, (38 + index * 0.4).toFixed(1));
      }
      await pressUntil(dash, /^Close the practice year$/);
      await pressBigButton(dash);

      await pressUntil(dash, /^Start Year 1$/);
      await pressBigButton(dash);
      await Promise.all(terminals.map((terminal) => waitForYear(terminal, 'Year 1')));

      // One year with real numbers behind it, so the results table and the
      // chart are not empty in the pictures that follow.
      for (const [index, terminal] of terminals.entries()) {
        await submitDecision(terminal, (40 + index * 0.5).toFixed(1));
      }
      await pressUntil(dash, /^Close Year 1$/);
      await pressBigButton(dash);

      await pressUntil(dash, /^Start Year 2$/);
      await pressBigButton(dash);
      await Promise.all(terminals.map((terminal) => waitForYear(terminal, 'Year 2')));

      // --- 4. the terminal, deciding ---------------------------------------

      await expect(first.page.getByRole('textbox', { name: 'Million barrels' })).toBeEnabled();
      await shoot(first, 'terminal-decide');

      // The teacher, with a year open and seven of nine in.
      for (const terminal of terminals.slice(0, 7)) {
        await submitDecision(terminal, '41.0');
      }
      await expect(dash.getByRole('group', { name: 'Where the game is' })).toContainText('7 / 9');
      await shoot(lesson.instructor, 'teacher-live-deciding');

      // The terminal, waiting: the number is in and there is nothing to do.
      await expect(first.page.locator('.decision-done')).toBeVisible();
      await shoot(first, 'terminal-waiting');

      // --- 5. messaging on -------------------------------------------------

      const strip = dash.getByRole('group', { name: 'Where the game is' });
      await dash.getByRole('button', { name: 'Turn messaging on' }).click();
      await dash.getByRole('button', { name: 'Turn messaging on for 4 minutes' }).click();
      await expect(strip.getByText('ON', { exact: true })).toBeVisible();

      const box = 'Write to the other countries in your world';
      await first.page.getByLabel(box).fill('Shall we all keep to 38.3 this year?');
      await first.page.getByRole('button', { name: 'Send', exact: true }).click();
      await second.page.getByLabel(box).fill('Agreed. We will produce 38.3 million barrels.');
      await second.page.getByRole('button', { name: 'Send', exact: true }).click();

      await expect(first.page.locator('.message-list')).toContainText('Agreed.');
      await shoot(first, 'terminal-messaging-on');
      await shoot(lesson.instructor, 'teacher-live-messaging-on');
      await shoot(projector, 'projector-messaging-on');

      await dash.getByRole('button', { name: 'Turn off now' }).click();
      await expect(strip.getByText('OFF', { exact: true })).toBeVisible();
      await expect(first.page.getByLabel(box)).toHaveCount(0);
      await shoot(first, 'terminal-messaging-off');

      // --- 6. the results of a year ----------------------------------------

      for (const terminal of terminals.slice(7)) await submitDecision(terminal, '41.0');
      await pressUntil(dash, /^Close Year 2$/);
      await pressBigButton(dash);

      await expect(first.page.getByRole('heading', { name: 'Year 2 results' })).toBeVisible();
      await shoot(first, 'terminal-results');
      await shoot(lesson.instructor, 'teacher-live-results');
      await expect(projector.page.locator('.projector-price').first()).toBeVisible();
      await shoot(projector, 'projector-results');

      // --- 7. the debrief ---------------------------------------------------

      await pressUntil(dash, /^End the game$/);
      await pressBigButton(dash);
      await expect(first.page.getByRole('heading', { name: 'Three questions' })).toBeVisible();
      await shoot(first, 'terminal-ended');

      expect(await bigButtonLabel(dash)).toBe('Reveal results to teams');
      await pressBigButton(dash);
      await expect(dash.getByRole('heading', { name: 'Debrief' })).toBeVisible();

      const tabs = dash.getByRole('tablist', { name: 'Debrief screens' });
      for (const title of ['World comparison', 'World detail', 'Game theory']) {
        await tabs.getByRole('tab', { name: title }).click();
        await expect(dash.locator('.debrief-screen')).toBeVisible();
        await shoot(lesson.instructor, `debrief-${title.toLowerCase().replace(/ /g, '-')}`);
      }

      // One debrief screen on the wall, which is what a room actually sees.
      await dash.getByRole('button', { name: 'Show on projector' }).click();
      await expect(projector.page.locator('.debrief-screen')).toBeVisible({ timeout: 20_000 });
      await shoot(projector, 'projector-debrief');

      // --- nothing complained ----------------------------------------------

      const screens: Screen[] = [lesson.instructor, projector, ...terminals];
      const problems = allProblems(screens);
      expect(problems, `\n${problems.join('\n')}`).toEqual([]);
    } finally {
      for (const terminal of terminals) await terminal.context.close();
      if (projector) await projector.context.close();
      if (lesson) await lesson.instructor.context.close();
      await server.cleanup();
    }
  });
});
