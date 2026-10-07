/**
 * F2 - a whole lesson in real browsers, and I1 inside it.
 *
 * One instructor, one projector and nine terminals, each in its own browser
 * context, so each has its own storage and its own socket exactly as nine
 * classroom computers would. Everything is done through the screens: the
 * teacher presses the one big button, the groups type their numbers, write
 * messages and promises, and answer the reflection questions.
 *
 * Two deliberate accidents happen on the way:
 *   - one terminal is reloaded in the middle of a year, and must come back as
 *     the same country with the number it had typed still in the box (R1),
 *   - the server is killed and restarted in the middle of a year, and every
 *     screen must come back and the lesson carry on from where it was (R6).
 *
 * At the end the privacy scan from Phase 3 (I1) is run over the actual socket
 * frames each browser received - not over what a view builder says it sends,
 * but over what arrived on the wire.
 *
 * Any console error on any screen fails the run.
 */

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { DEBRIEF_SCREENS } from '../../src/shared/debrief/types.js';
import { describeLeaks, scan, secretsForProjector, secretsForTeam } from '../support/privacy.js';
import { parseCsv } from './support/csv.js';
import { GameServer } from './support/server.js';
import {
  allProblems,
  bigButtonLabel,
  claimTeam,
  createLesson,
  openScreen,
  pressBigButton,
  pressUntil,
  reopenDecision,
  savedState,
  submitDecision,
  waitForYear,
  type Screen,
  type TeamScreen,
} from './support/room.js';

/** The year a terminal is reloaded in. */
const RELOAD_YEAR = 5;
/** The year the server is killed in. */
const RESTART_YEAR = 8;
/** test-fast's own years and schedule; see createLesson about the timers. */
const YEARS = 12;
const WORLDS = 3;

test.describe('F2 - a whole game in nine browsers', () => {
  test('plays a complete test-fast lesson, survives a reload and a restart', async ({
    browser,
  }) => {
    const server = await GameServer.start();
    const terminals: TeamScreen[] = [];
    let projector: Screen | null = null;
    let lesson: Awaited<ReturnType<typeof createLesson>> | null = null;

    try {
      // --- setup ------------------------------------------------------------

      lesson = await createLesson(browser, server, {
        worlds: WORLDS,
        preset: 'test-fast',
        timerSeconds: 900,
        activitySeconds: 900,
        announceNewProducer: true,
      });
      const dash = lesson.instructor.page;
      expect(lesson.teams).toHaveLength(WORLDS * 3);

      // The projector, on its own read-only link.
      projector = await openScreen(
        browser,
        `${server.url}/projector/${lesson.sessionId}?k=${lesson.projectorKey}`,
      );
      // In the lobby it shows the join address and the table cards (SPEC 8.5).
      await expect(projector.page.locator('.projector-url')).toContainText('/join');
      await expect(projector.page.getByRole('heading', { name: /Find your table/i })).toBeVisible();

      // --- nine groups join ------------------------------------------------

      for (const team of lesson.teams) {
        terminals.push(await claimTeam(browser, lesson, team, ['Ada', 'Ben', 'Cleo']));
      }
      // The dashboard says all nine are connected.
      for (const team of lesson.teams) {
        await expect(
          dash.locator(`.team-row:has-text("${team.joinCode}")`).locator('.team-row-status'),
        ).toContainText('Connected');
      }

      // --- the briefing and the quick check --------------------------------

      expect(await bigButtonLabel(dash)).toBe('Start the briefing');
      await pressBigButton(dash);
      const first = terminals[0];
      if (!first) throw new Error('no terminal');
      await expect(first.page.getByText('Briefing, screen 1 of 4')).toBeVisible();

      await pressUntil(dash, /^Start the practice year$/);
      await expect(first.page.getByText('Briefing, screen 4 of 4')).toBeVisible();

      // The quick check is on the last briefing screen, with instant feedback
      // and no marking (SPEC 8.3).
      const check = first.page.getByRole('heading', { name: 'Quick check' });
      await expect(check).toBeVisible();
      const firstQuestion = first.page.locator('.check-list > li').first();
      await firstQuestion.getByRole('button').first().click();
      await expect(firstQuestion.locator('.check-feedback')).not.toHaveText('');

      // --- the practice year ------------------------------------------------

      await pressBigButton(dash);
      await Promise.all(terminals.map((terminal) => waitForYear(terminal, 'PRACTICE')));
      await expect(first.page.getByText('This is the practice year')).toBeVisible();

      await Promise.all(
        terminals.map((terminal, index) => submitDecision(terminal, formatted(380 + index))),
      );
      expect(await bigButtonLabel(dash)).toBe('Close the practice year');
      await pressBigButton(dash);

      // Every terminal sees the practice reveal, with a price and a sentence.
      await Promise.all(
        terminals.map(async (terminal) => {
          await expect(terminal.page.locator('.reveal-price')).toBeVisible();
        }),
      );
      // And so does the projector, because projectorShowsPrices is on.
      await expect(projector.page.locator('.price-list')).toBeVisible();

      // --- every year, with real input --------------------------------------

      /** What each terminal sent, so the exports can be checked against it. */
      const sent = new Map<string, Map<number, string>>();
      let pledged = false;
      let chatted = false;

      for (let year = 1; year <= YEARS; year += 1) {
        await pressUntil(dash, new RegExp(`^Start Year ${String(year)}$`));
        expect(await bigButtonLabel(dash)).toBe(`Start Year ${String(year)}`);
        await pressBigButton(dash);
        await Promise.all(
          terminals.map((terminal) => waitForYear(terminal, `Year ${String(year)}`)),
        );

        // The new producer arrives in Year 9 and is announced, so the news
        // reaches every terminal and the room screen.
        if (year === 9) {
          await expect(first.page.getByText(/Another producer has started selling/)).toBeVisible();
          await expect(
            projector.page.getByText(/Another producer has started selling/),
          ).toBeVisible();
        }

        // The final-year warning was given before the last year opened.
        if (year === YEARS) {
          await expect(
            first.page.getByText('Your teacher says this is the final year'),
          ).toBeVisible();
          await expect(dash.locator('.phase-controls')).toBeVisible();
        }

        // One terminal is reloaded mid-year with a number typed but not sent.
        if (year === RELOAD_YEAR) await reloadMidYear(terminals, year);

        await Promise.all(
          terminals.map(async (terminal, index) => {
            const value = formatted(300 + year * 5 + index);
            await reopenDecision(terminal);
            await submitDecision(terminal, value);
            const byYear = sent.get(terminal.teamId) ?? new Map<number, string>();
            byYear.set(year, value);
            sent.set(terminal.teamId, byYear);
          }),
        );

        // The server is killed in the middle of a year, after the decisions are
        // in. Nothing may be lost, and every screen has to come back.
        if (year === RESTART_YEAR) {
          await restartMidYear(server, lesson.instructor, terminals, projector, year, sent);
        }

        await pressUntil(dash, new RegExp(`^Close Year ${String(year)}$`));
        await pressBigButton(dash);
        await Promise.all(
          terminals.map((terminal) => expect(terminal.page.locator('.reveal-price')).toBeVisible()),
        );

        // A chat window follows Year 3 and Year 10; a summit follows Year 7.
        const label = await bigButtonLabel(dash);
        if (/^Open chat window/.test(label)) {
          await pressBigButton(dash);
          await Promise.all(
            terminals.map((terminal) =>
              expect(terminal.page.getByRole('heading', { name: 'Chat window' })).toBeVisible(),
            ),
          );

          // One group writes a message, another promises a number, and both
          // reach the other countries in their own world.
          const writer = terminals[0];
          const promiser = terminals[1];
          const sameWorld = terminals[2];
          if (!writer || !promiser || !sameWorld) throw new Error('missing terminals');

          const text = `Let us all produce 38.3 in Year ${String(year + 1)}.`;
          await writer.page.getByLabel('Write to the other countries in your world').fill(text);
          await writer.page.getByRole('button', { name: 'Send', exact: true }).click();
          await expect(sameWorld.page.locator('.message-list')).toContainText(text);
          chatted = true;

          if (!pledged) {
            await promiser.page.getByLabel('Promise a number (million barrels)').fill('38.3');
            await promiser.page.getByRole('button', { name: 'Send our promise' }).click();
            await expect(sameWorld.page.locator('.message-list')).toContainText(
              'We will produce 38.3 million barrels.',
            );
            await expect(
              sameWorld.page.locator('.message-list .message-tag', { hasText: 'promise' }),
            ).toBeVisible();
            pledged = true;
          }

          // A world's chat is that world's own: the next world never sees it,
          // anywhere on its screen.
          const otherWorld = terminals.find(
            (terminal) => terminal.worldNumber !== writer.worldNumber,
          );
          if (!otherWorld) throw new Error('there is no second world');
          await expect(otherWorld.page.locator('.page-team')).not.toContainText(text);
          await expect(otherWorld.page.locator('.page-team')).not.toContainText(
            'We will produce 38.3 million barrels.',
          );

          await pressBigButton(dash);
        } else if (/^Hold the summit/.test(label)) {
          await pressBigButton(dash);
          await Promise.all(
            terminals.map((terminal) =>
              expect(
                terminal.page.getByRole('heading', { name: 'Envoys: go to the meeting point' }),
              ).toBeVisible(),
            ),
          );
          await pressBigButton(dash);
        }
      }

      expect(chatted, 'no chat window was ever opened').toBe(true);
      expect(pledged, 'no promise was ever made').toBe(true);

      // --- the end, and the reflections -------------------------------------

      await pressUntil(dash, /^End the game$/);
      // Everything the projector was sent up to here was sent during play, when
      // the room may see no chat at all. What comes after is what the teacher
      // deliberately mirrored, which is a different rule (see the scan below).
      const projectorFramesDuringPlay = projector.frames.length;
      await pressBigButton(dash);

      await Promise.all(
        terminals.map(async (terminal) => {
          await expect(
            terminal.page.getByRole('heading', { name: 'The game has finished' }),
          ).toBeVisible();
          // Nothing about another world yet (SPEC section 7).
          await expect(
            terminal.page.getByRole('heading', { name: 'Every country in the class' }),
          ).toBeHidden();

          // Each group's answers name the group. A reflection is the most
          // private thing a student writes, so the privacy scan at the end
          // checks that nobody else was sent it - and it can only check that if
          // the nine sets of answers are told apart.
          const mine = `${terminal.teamId} says`;
          await terminal.page
            .locator('#reflect-0')
            .fill(`${mine} we cooperated best in the first years.`);
          await terminal.page
            .locator('#reflect-1')
            .fill(`${mine} one promise broke and we talked about it.`);
          await terminal.page
            .locator('#reflect-2')
            .fill(`${mine} we would agree a number and stick to it.`);
          await terminal.page.getByRole('button', { name: 'Save our answers' }).click();
          await expect(terminal.page.getByText('Saved. You can change them')).toBeVisible();
        }),
      );

      // --- reveal, and every debrief screen ---------------------------------

      expect(await bigButtonLabel(dash)).toBe('Reveal results to teams');
      await pressBigButton(dash);

      await Promise.all(
        terminals.map((terminal) =>
          expect(
            terminal.page.getByRole('heading', { name: 'Every country in the class' }),
          ).toBeVisible(),
        ),
      );
      await expect(
        first.page.getByRole('heading', { name: 'Your world, year by year' }),
      ).toBeVisible();

      await expect(dash.getByRole('heading', { name: 'Debrief' })).toBeVisible();
      const tabs = dash.getByRole('navigation', { name: 'Debrief screens' });

      for (const name of DEBRIEF_SCREENS) {
        const title = TITLES[name];
        await tabs.getByRole('button', { name: title }).click();
        // Each screen names itself in its own heading, which is how the test
        // knows the right one is up: the tab titles are short labels, and the
        // headings are the sentences the teacher reads out.
        await expect(dash.locator('.debrief-screen')).toHaveAttribute(
          'aria-labelledby',
          HEADING_IDS[name],
        );

        // Show on projector, and the room follows in large type.
        await dash.getByRole('button', { name: 'Show on projector' }).click();
        await expect(
          dash
            .getByRole('status')
            .filter({ hasText: `The projector is showing ${title}.` })
            .first(),
        ).toBeVisible();
        await expect(projector.page.locator('.debrief-screen')).toHaveAttribute(
          'aria-labelledby',
          HEADING_IDS[name],
          { timeout: 20_000 },
        );
      }

      // Back to the room screen, and the projector stops showing the debrief.
      await dash.getByRole('button', { name: 'Back to the room screen' }).click();
      await expect(projector.page.locator('.debrief-screen')).toBeHidden({ timeout: 20_000 });

      // --- the exports, downloaded from the browser and parsed --------------

      const download = await Promise.all([
        dash.waitForEvent('download'),
        dash.getByRole('link', { name: /Decisions/i }).click(),
      ]).then(([event]) => event);

      expect(download.suggestedFilename()).toMatch(/decisions\.csv$/);
      const path = await download.path();
      expect(path).not.toBeNull();
      const csv = await readFile(path ?? '', 'utf8');
      // A byte-order mark, so a spreadsheet reads accented names properly.
      expect(csv.startsWith('﻿')).toBe(true);

      // It parses, it has a row per country per scored year, and the numbers
      // are the numbers the groups actually typed.
      const table = parseCsv(csv);
      expect(table.header[0]).toBe('World');
      const scored = table.rows.filter((row) => table.cell(row, 'Practice') === 'no');
      expect(scored).toHaveLength(WORLDS * 3 * YEARS);

      for (const terminal of terminals) {
        for (const [year, value] of sent.get(terminal.teamId) ?? []) {
          const row = scored.find(
            (candidate) =>
              table.cell(candidate, 'World') === String(terminal.worldNumber) &&
              table.cell(candidate, 'Year') === String(year) &&
              table.cell(candidate, 'Letter') === terminal.letter,
          );
          expect(row, `${terminal.teamId} year ${String(year)} is not in the CSV`).toBeDefined();
          if (row) {
            expect(table.cell(row, 'Target (million barrels)')).toBe(value);
            expect(table.cell(row, 'Filled in by the server')).toBe('no');
          }
        }
      }
      // And no key or token is anywhere in a file a teacher might email.
      const stateForCsv = await savedState(lesson);
      expect(csv).not.toContain(stateForCsv.instructorKey);
      expect(csv).not.toContain(stateForCsv.projectorKey);

      // --- I1: the privacy scan, over what really arrived -------------------

      const state = await savedState(lesson);
      // World Detail was only ever mirrored for the world the picker starts on,
      // so that is the one world whose timeline the room was allowed to read.
      const shownWorldIds = [state.worlds[0]?.worldId ?? ''];

      const leaks = [
        ...terminals.flatMap((terminal) =>
          scan(terminal.teamId, terminal.frames.join('\n'), secretsForTeam(state, terminal.teamId)),
        ),
        // During the lesson the room sees no chat whatsoever.
        ...scan(
          'the projector during play',
          projector.frames.slice(0, projectorFramesDuringPlay).join('\n'),
          secretsForProjector(state),
        ),
        // Afterwards it sees the one screen the teacher sent, and still never a
        // key, a code, a token, a huddle reason, a reflection, or another
        // world's messages.
        ...scan(
          'the projector during the debrief',
          projector.frames.slice(projectorFramesDuringPlay).join('\n'),
          secretsForProjector(state, { shownWorldIds }),
        ),
      ];
      expect(leaks.length, `\n${describeLeaks(leaks)}`).toBe(0);

      // Every screen really was sent something, so the scan had work to do.
      expect(projectorFramesDuringPlay).toBeGreaterThan(5);
      for (const terminal of terminals) {
        expect(terminal.frames.length, `${terminal.teamId} received nothing`).toBeGreaterThan(5);
      }

      // --- no screen complained ---------------------------------------------

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

const TITLES: Record<(typeof DEBRIEF_SCREENS)[number], string> = {
  worldComparison: 'World comparison',
  worldDetail: 'World detail',
  leaderboard: 'Leaderboard',
  gameTheory: 'Game theory',
  questions: 'Questions',
};

/** Which heading each debrief screen labels itself with. */
const HEADING_IDS: Record<(typeof DEBRIEF_SCREENS)[number], string> = {
  worldComparison: 'comparison-heading',
  worldDetail: 'detail-heading',
  leaderboard: 'leaderboard-heading',
  gameTheory: 'theory-heading',
  questions: 'questions-heading',
};

/** Tenths as a student would type them. */
function formatted(tenths: number): string {
  return (tenths / 10).toFixed(1);
}

/**
 * R1 inside F2: a terminal is reloaded with a number typed but not sent.
 *
 * It has to come back as the same country within five seconds, and the number
 * the group had agreed on has to still be in the box - which is why drafts are
 * kept in localStorage.
 */
async function reloadMidYear(terminals: TeamScreen[], year: number): Promise<void> {
  const terminal = terminals[4];
  if (!terminal) throw new Error('no terminal to reload');
  const typed = '41.7';

  const field = terminal.page.getByLabel(/How many million barrels will .+ produce\?/);
  await field.fill(typed);
  await expect(field).toHaveValue(typed);

  const startedAt = Date.now();
  await terminal.page.reload();

  // The same country, within five seconds.
  await expect(terminal.page.locator('.terminal-label')).toHaveText(terminal.label, {
    timeout: 5000,
  });
  await expect(terminal.page.locator('.terminal-year')).toHaveText(`Year ${String(year)}`);
  expect(Date.now() - startedAt).toBeLessThan(5000);

  // And the number is still there.
  await expect(terminal.page.getByLabel(/How many million barrels will .+ produce\?/)).toHaveValue(
    typed,
  );
}

/**
 * R6 inside F2: the server is killed and started again mid-year.
 *
 * Everything already decided has to be there, the lesson has to come back
 * paused and say so, and every screen has to reconnect on its own.
 */
async function restartMidYear(
  server: GameServer,
  instructor: Screen,
  terminals: TeamScreen[],
  projector: Screen,
  year: number,
  sent: Map<string, Map<number, string>>,
): Promise<void> {
  await server.restart();

  const dash = instructor.page;
  // The dashboard comes back by itself and says what happened (SPEC section 9).
  await expect(dash.locator('.phase-paused')).toHaveText('Resumed after restart - press Resume', {
    timeout: 60_000,
  });
  await expect(dash.locator('.terminal-status, .phase-where')).toBeVisible();

  // Every terminal comes back as itself, on the right year, with its number.
  for (const terminal of terminals) {
    await expect(terminal.page.locator('.terminal-status')).toContainText('Connected', {
      timeout: 60_000,
    });
    await expect(terminal.page.locator('.terminal-year')).toHaveText(`Year ${String(year)}`);
    const value = sent.get(terminal.teamId)?.get(year);
    expect(value).toBeDefined();
    await expect(terminal.page.locator('.decision-state')).toContainText(
      `Submitted ${String(value)} million barrels`,
    );
  }

  // So does the projector.
  await expect(projector.page.locator('.projector-year')).toHaveText(`Year ${String(year)}`, {
    timeout: 60_000,
  });

  // The teacher presses Resume and the lesson carries on.
  await dash.getByRole('button', { name: 'Resume' }).click();
  await expect(dash.locator('.phase-paused')).toBeHidden();
}
