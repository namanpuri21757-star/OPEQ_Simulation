/**
 * A2 - a terminal plays a whole year with no mouse at all.
 *
 * Not "could in principle": the test never calls click(). Every single action is
 * a key press, found by tabbing until the right thing has focus, which is what a
 * student using a keyboard, a switch or a screen reader actually does.
 *
 * It covers the lot: typing the join code, confirming the country, typing the
 * first names, nudging the number with the steppers, submitting through the
 * confirmation dialog, changing the number, writing the waiting-time guess, and
 * reading the result. If any of those could not be reached by keyboard, the
 * tabbing would run out of elements and the test would say which step it was on.
 */

import { expect, test, type Page } from '@playwright/test';
import { GameServer } from './support/server.js';
import { createLesson, openScreen, pressBigButton, pressUntil } from './support/room.js';

/** How many stops to try in each direction before giving up. */
const MAX_TABS = 120;
/** How many tabs with focus not moving means the end of the document. */
const STUCK_LIMIT = 3;

/** What has focus right now, as a short description. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return 'nothing';
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const text = (element.textContent ?? '').trim().slice(0, 40);
    const label = element.getAttribute('aria-label') ?? '';
    return `${tag}${id} "${text}" [${label}]`;
  });
}

/**
 * Walks the tab order until something has focus, forwards and then backwards.
 *
 * Both directions matter, and not only because browsers differ about whether
 * Tab wraps round at the end of the document (Chromium does, Firefox hands
 * focus to its own toolbar). The minus buttons on the number stepper sit before
 * the field in the document, so reaching them from the field is Shift+Tab -
 * which is exactly what a person using a keyboard presses.
 *
 * On failure it lists the stops it did visit, so a control that really cannot
 * be reached is named along with what the tab order actually is.
 */
async function walkTo(page: Page, hasFocus: () => Promise<boolean>, what: string): Promise<void> {
  const trail: string[] = [];

  for (const key of ['Tab', 'Shift+Tab'] as const) {
    let stuck = 0;
    let last = '';
    for (let i = 0; i < MAX_TABS; i += 1) {
      if (await hasFocus()) return;
      const where = await focused(page);
      if (trail[trail.length - 1] !== where) trail.push(where);
      // Focus stopped moving: this is the end of the document in this
      // direction, so there is no point pressing the same key again.
      stuck = where === last ? stuck + 1 : 0;
      last = where;
      if (stuck >= STUCK_LIMIT) break;
      await page.keyboard.press(key);
    }
  }

  const order = [...new Set(trail)].map((stop) => `  ${stop}`).join('\n');
  throw new Error(`The keyboard never reached ${what}. The tab order was:\n${order}`);
}

/** Walks the tab order to an element, by selector. */
async function tabTo(page: Page, selector: string, what: string): Promise<void> {
  const target = page.locator(selector);
  await walkTo(
    page,
    () => target.evaluate((element) => element === document.activeElement),
    `${what} (${selector})`,
  );
}

/** Walks the tab order to a button by its accessible name and presses Enter. */
async function pressByKeyboard(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  await expect(button).toBeVisible();
  await walkTo(
    page,
    () => button.evaluate((element) => element === document.activeElement),
    `the button "${name}"`,
  );
  await page.keyboard.press('Enter');
}

test.describe('A2 - keyboard only', () => {
  test('a group joins, plays a whole year and reads the result without a mouse', async ({
    browser,
  }) => {
    const server = await GameServer.start();

    try {
      const lesson = await createLesson(browser, server, {
        worlds: 1,
        preset: 'test-fast',
        timerSeconds: 900,
        activitySeconds: 900,
      });
      const dash = lesson.instructor.page;
      const team = lesson.teams[0];
      const second = lesson.teams[1];
      const third = lesson.teams[2];
      if (!team || !second || !third) throw new Error('no teams');

      const terminal = await openScreen(browser, `${server.url}/join`);
      const page = terminal.page;

      // --- joining, by keyboard --------------------------------------------

      await tabTo(page, '#join-code', 'the team code box');
      await page.keyboard.type(team.joinCode);
      await expect(page.locator('#join-code')).toHaveValue(team.joinCode);
      await pressByKeyboard(page, 'This is our code');

      await expect(
        page.getByRole('heading', { name: /^You are World .* Is that right\?$/ }),
      ).toBeVisible();
      await pressByKeyboard(page, 'Yes, that is us');

      await expect(page.getByRole('heading', { name: 'Who is in your group?' })).toBeVisible();
      await tabTo(page, '#member-0', 'the first name box');
      await page.keyboard.type('Ada');
      await page.keyboard.press('Tab');
      await page.keyboard.type('Ben');
      await pressByKeyboard(page, 'Save and start');
      await expect(page.locator('.page-team')).toBeVisible();

      // The other two countries are played with a mouse, because the test is
      // about one terminal and a year needs three.
      const others = [];
      for (const other of [second, third]) {
        const screen = await openScreen(browser, `${server.url}/join/${other.joinCode}`);
        await screen.page.getByRole('button', { name: 'This is our code' }).click();
        await screen.page.getByRole('button', { name: 'Yes, that is us' }).click();
        await screen.page.getByRole('button', { name: 'Skip' }).click();
        await expect(screen.page.locator('.page-team')).toBeVisible();
        others.push(screen);
      }

      // --- a whole year, by keyboard ---------------------------------------

      await pressUntil(dash, /^Start the practice year$/);
      await pressBigButton(dash);
      await pressUntil(dash, /^Close the practice year$/);
      await pressBigButton(dash);
      await pressUntil(dash, /^Start Year 1$/);
      await pressBigButton(dash);
      await expect(page.locator('.team-year')).toHaveText('1');

      // Type the number. One field sets it, so Tab reaches it and that is all.
      const field = page.getByRole('textbox', { name: 'Million barrels' });
      await field.evaluate((element: HTMLInputElement) => element.blur());
      await page.keyboard.press('Tab');
      await tabTo(page, 'input[inputmode="decimal"]', 'the decision box');
      await page.keyboard.press('Control+a');
      await page.keyboard.type('39.0');
      await expect(field).toHaveValue('39.0');

      // Submit, and answer the confirmation dialog - which puts focus on its
      // first button when it opens, so Enter is enough.
      await pressByKeyboard(page, 'Submit');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      expect(await focused(page)).toContain('Yes, submit');
      await page.keyboard.press('Enter');
      await expect(dialog).toBeHidden();
      await expect(page.locator('.decision-done')).toContainText(
        'Submitted: 39.0 million barrels.',
      );

      // Escape closes a dialog, so a student who opens one by accident is not
      // stuck in it.
      await pressByKeyboard(page, 'Change');
      await pressByKeyboard(page, 'Submit the new number');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();

      // Nothing else on the year screen asks to be filled in once the number
      // is sent, so the next thing a keyboard reaches is the Change button.
      await pressByKeyboard(page, 'Submit the new number');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Enter');
      await expect(page.locator('.decision-done')).toContainText(
        'Submitted: 39.0 million barrels.',
      );

      // --- reading the result ----------------------------------------------

      for (const screen of others) {
        await screen.page.getByRole('textbox', { name: 'Million barrels' }).fill('38.3');
        await screen.page.getByRole('button', { name: /^Submit/ }).click();
        await screen.page.getByRole('dialog').getByRole('button', { name: 'Yes, submit' }).click();
      }
      await pressUntil(dash, /^Close Year 1$/);
      await pressBigButton(dash);

      // The price is announced in a live region, so a screen reader says it
      // without the student going looking (SPEC section 9).
      await expect(page.locator('.obs-value').first()).toBeVisible();
      const sentence = page.locator('.lede[role="status"]').first();
      await expect(sentence).toBeVisible();
      await expect(sentence).toHaveAttribute('role', 'status');

      // And the data tables behind the charts are reachable by keyboard: a wide
      // table scrolls sideways on a 1024-pixel laptop, so a keyboard user has
      // to be able to put focus in it and scroll (SPEC section 9).
      await tabTo(
        page,
        '.table-scroll >> nth=0',
        'the first table behind a chart on the reveal screen',
      );

      expect(terminal.problems, `\n${terminal.problems.join('\n')}`).toEqual([]);

      for (const screen of others) await screen.context.close();
      await terminal.context.close();
      await lesson.instructor.context.close();
    } finally {
      await server.cleanup();
    }
  });
});
