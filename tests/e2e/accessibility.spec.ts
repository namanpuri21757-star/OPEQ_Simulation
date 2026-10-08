/**
 * A1 - axe on every screen a person uses.
 *
 * SPEC section 9 asks for semantic HTML, labelled inputs, visible focus, full
 * keyboard use, aria-live for results and timer milestones, never colour alone,
 * WCAG AA contrast and a data table behind every chart. Most of those are not
 * things a machine can check, which is why there is a keyboard test beside this
 * one and a usability pilot after it. What axe can check, it checks here.
 *
 * Nothing serious or critical is allowed. Moderate and minor findings are
 * printed so they can be read and judged, because some of them are about choices
 * a projector screen makes on purpose (very large type, few landmarks).
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { GameServer } from './support/server.js';
import {
  claimTeam,
  createLesson,
  openScreen,
  pressBigButton,
  pressUntil,
  submitDecision,
  waitForYear,
  type Screen,
} from './support/room.js';

/** Findings at these levels fail the test. */
const BLOCKING = ['serious', 'critical'];

interface Report {
  where: string;
  blocking: Array<{ id: string; impact: string; help: string; nodes: string[] }>;
  other: Array<{ id: string; impact: string }>;
}

async function audit(where: string, page: Page): Promise<Report> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const blocking = results.violations
    .filter((violation) => BLOCKING.includes(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? '',
      help: violation.help,
      nodes: violation.nodes.slice(0, 3).map((node) => node.html.slice(0, 160)),
    }));

  const other = results.violations
    .filter((violation) => !BLOCKING.includes(violation.impact ?? ''))
    .map((violation) => ({ id: violation.id, impact: violation.impact ?? '' }));

  return { where, blocking, other };
}

function describe(report: Report): string {
  return report.blocking
    .map(
      (violation) =>
        `${report.where}: ${violation.id} (${violation.impact}) - ${violation.help}\n    ${violation.nodes.join('\n    ')}`,
    )
    .join('\n');
}

test.describe('A1 - accessibility', () => {
  test('axe finds nothing serious or critical on any of the main screens', async ({ browser }) => {
    const server = await GameServer.start();
    const opened: Screen[] = [];
    const reports: Report[] = [];

    try {
      // --- the landing page and the join page, before any game exists -------

      const landing = await openScreen(browser, `${server.url}/`);
      opened.push(landing);
      reports.push(await audit('the landing page', landing.page));

      const lesson = await createLesson(browser, server, {
        worlds: 1,
        preset: 'test-fast',
        // Nothing closes itself, so each screen stays up long enough to audit.
        timerSeconds: 900,
        activitySeconds: 900,
      });
      opened.push(lesson.instructor);
      const dash = lesson.instructor.page;

      // The dashboard in the lobby, which is where the setup form lives.
      reports.push(await audit('the dashboard in the lobby', dash));

      const joinPage = await openScreen(browser, `${server.url}/join`);
      opened.push(joinPage);
      reports.push(await audit('the join page', joinPage.page));
      await joinPage.context.close();
      opened.pop();

      // --- the projector in the lobby ---------------------------------------

      const projector = await openScreen(
        browser,
        `${server.url}/projector/${lesson.sessionId}?k=${lesson.projectorKey}`,
      );
      opened.push(projector);
      reports.push(await audit('the projector in the lobby', projector.page));

      // --- three terminals, and a year --------------------------------------

      const terminals = [];
      for (const team of lesson.teams) {
        const terminal = await claimTeam(browser, lesson, team, ['Ada', 'Ben']);
        opened.push(terminal);
        terminals.push(terminal);
      }
      const first = terminals[0];
      if (!first) throw new Error('no terminal');

      await pressUntil(dash, /^Start the practice year$/);
      await pressBigButton(dash);
      await waitForYear(first, 'PRACTICE');
      for (const terminal of terminals) await submitDecision(terminal, '38.3');
      await pressBigButton(dash);
      await pressBigButton(dash);
      await waitForYear(first, 'Year 1');

      // The year screen with the decision box open: the screen a group spends
      // most of the lesson on.
      reports.push(await audit('a team year screen', first.page));
      // And the dashboard while a year is open, with the grid and the alerts.
      reports.push(await audit('the dashboard during a year', dash));

      for (const terminal of terminals) await submitDecision(terminal, '40.0');
      await pressUntil(dash, /^Close Year 1$/);
      await pressBigButton(dash);

      // The reveal, with the large price and the aria-live sentence.
      await expect(first.page.locator('.obs-value').first()).toBeVisible();
      reports.push(await audit('a team reveal screen', first.page));
      reports.push(await audit('the projector at a reveal', projector.page));

      // --- messaging on -----------------------------------------------------

      await pressUntil(dash, /^Turn messaging on/);
      await pressBigButton(dash);
      await expect(first.page.locator('.messages-state')).toContainText('Messaging is on');
      await first.page.getByLabel('Write to the other countries in your world').fill('Hello.');
      await first.page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(first.page.locator('.message-list')).toContainText('Hello.');
      reports.push(await audit('a team screen with messaging on', first.page));
      reports.push(await audit('the live screen with messaging on', dash));
      await pressBigButton(dash);

      // --- the end, the reflections and the debrief -------------------------

      await pressUntil(dash, /^End the game$/);
      await pressBigButton(dash);
      await expect(first.page.getByRole('heading', { name: 'Three questions' })).toBeVisible();
      reports.push(await audit('a team end screen', first.page));

      await pressBigButton(dash);
      await expect(dash.getByRole('heading', { name: 'Debrief' })).toBeVisible();
      reports.push(await audit('the debrief on the dashboard', dash));

      await dash.getByRole('button', { name: 'Show on projector' }).click();
      await expect(projector.page.locator('.debrief-screen')).toBeVisible({ timeout: 20_000 });
      reports.push(await audit('the debrief on the projector', projector.page));

      // --- the report -------------------------------------------------------

      const moderate = reports.flatMap((report) =>
        report.other.map((violation) => `${report.where}: ${violation.id} (${violation.impact})`),
      );
      if (moderate.length > 0) {
        console.log(
          `\nMinor and moderate axe findings, for judgement:\n  ${moderate.join('\n  ')}`,
        );
      }

      const blocking = reports.filter((report) => report.blocking.length > 0);
      expect(blocking.map(describe).join('\n'), '\naxe found serious problems').toBe('');
      // Every screen in the list really was audited.
      expect(reports).toHaveLength(13);
    } finally {
      for (const screen of opened) await screen.context.close();
      await server.cleanup();
    }
  });
});
