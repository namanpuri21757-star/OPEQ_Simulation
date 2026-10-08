/**
 * Driving a classroom through real browsers.
 *
 * Everything here goes through the screens a person would use: the instructor
 * presses the one big button, a group types its code and its number, the
 * projector just watches. Nothing reaches in and calls a command directly,
 * because the point of the end-to-end suite is the part the unit and
 * integration suites cannot reach - the screens.
 *
 * The only thing read from outside the browsers is the saved state on disk, and
 * only to learn the join codes and the keys (which a teacher reads off a printed
 * card) and to run the privacy scan.
 */

import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { OpenSessionsResponse } from '../../../src/shared/protocol.js';
import type { SessionState } from '../../../src/shared/state.js';
import type { GameServer } from './server.js';

export interface Screen {
  context: BrowserContext;
  page: Page;
  /** Every console error and page error this screen produced. */
  problems: string[];
  /**
   * Every socket frame the server sent to this screen.
   *
   * This is the real wire data, which is what the privacy scan wants: not what
   * a view builder says it sends, but what actually arrived.
   */
  frames: string[];
  /**
   * Every URL this screen asked for, including the WebSocket it opened.
   *
   * The offline guarantee (acceptance O1) is the reason: a page that reached
   * for a font, a CDN or an analytics beacon would be a lesson that needs the
   * internet, and this is the list that proves none of them does.
   */
  requests: string[];
}

export interface TeamScreen extends Screen {
  teamId: string;
  joinCode: string;
  letter: string;
  worldNumber: number;
  label: string;
}

/**
 * Console noise that is not the app's fault and not worth failing a run for.
 *
 * Kept deliberately short. Anything the app logs itself must not be in here.
 */
const IGNORED_CONSOLE = [
  // Chromium says this when a page is closed while a request is in flight.
  'net::ERR_ABORTED',
  'Failed to load resource: net::ERR_',
  // Every browser logs something when a socket is cut off. The end-to-end test
  // kills the server on purpose, so these are the expected noise of that, not
  // the app complaining - and the test goes on to assert that every screen
  // reconnected, which is the thing that actually matters.
  'WebSocket is closed before the connection is established',
  'was interrupted while the page was loading',
  'websocket error',
];

function watch(page: Page, problems: string[], frames: string[], requests: string[]): void {
  page.on('request', (request) => {
    requests.push(request.url());
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (IGNORED_CONSOLE.some((ignore) => text.includes(ignore))) return;
    problems.push(`console error: ${text}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`page error: ${error.message}`);
  });
  page.on('websocket', (socket) => {
    requests.push(socket.url());
    socket.on('framereceived', (frame) => {
      if (typeof frame.payload === 'string') frames.push(frame.payload);
      else frames.push(frame.payload.toString('utf8'));
    });
  });
}

/**
 * Opens another tab on a computer that already has a screen open.
 *
 * The printable pages (/instructor/cards, /instructor/summary) are built from
 * what the dashboard saved in that browser, so they only work in the same
 * browser - which is exactly how a teacher reaches them, by pressing a button
 * that opens a new tab.
 */
export async function openTab(screen: Screen, url: string): Promise<Screen> {
  const page = await screen.context.newPage();
  const problems: string[] = [];
  const frames: string[] = [];
  const requests: string[] = [];
  watch(page, problems, frames, requests);
  await page.goto(url);
  return { context: screen.context, page, problems, frames, requests };
}

/** Opens one browser context (a separate computer, with its own storage). */
export async function openScreen(browser: Browser, url: string): Promise<Screen> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems: string[] = [];
  const frames: string[] = [];
  const requests: string[] = [];
  watch(page, problems, frames, requests);
  await page.goto(url);
  return { context, page, problems, frames, requests };
}

// ---------------------------------------------------------------------------
// The instructor.
// ---------------------------------------------------------------------------

export interface Lesson {
  server: GameServer;
  instructor: Screen;
  sessionId: string;
  instructorKey: string;
  projectorKey: string;
  teams: Array<{ teamId: string; joinCode: string; letter: string; worldNumber: number }>;
}

/**
 * Starts a session the way a teacher does: open the dashboard, create a game,
 * pick a preset, say how many worlds, save.
 *
 * `timerSeconds` is passed through to the advanced settings. test-fast's own
 * five-second years exist so a developer can watch a whole game in a minute,
 * and with nine browser contexts typing real numbers they would close a year
 * before the room had finished - which would make "every year with real input"
 * impossible to test. So the lesson keeps test-fast's years and schedule and
 * gives each year a classroom-length timer (see docs/DECISIONS.md).
 */
export async function createLesson(
  browser: Browser,
  server: GameServer,
  options: {
    worlds?: number;
    preset?: string;
    timerSeconds?: number;
    /** How long each chat window and summit lasts, for the same reason. */
    activitySeconds?: number;
    /** Put the new producer in the news, so the room can see it arrive. */
    announceNewProducer?: boolean;
  } = {},
): Promise<Lesson> {
  const worlds = options.worlds ?? 3;
  const preset = options.preset ?? 'test-fast';
  const timerSeconds = options.timerSeconds ?? 900;

  const instructor = await openScreen(browser, `${server.url}/`);
  const page = instructor.page;

  // The landing page: two large buttons (SPEC 8.1).
  await expect(page.getByRole('heading', { name: 'Crude Accord' })).toBeVisible();
  await page.getByRole('link', { name: 'I am the instructor' }).click();

  await page.getByRole('button', { name: 'Create session' }).click();
  // The start screen: five numbered steps, and the settings in the corner.
  await expect(page.getByRole('heading', { name: 'Step 1 Print team cards' })).toBeVisible();
  await page.getByRole('link', { name: 'Lesson settings' }).click();
  await expect(page.getByRole('heading', { name: 'Lesson settings' })).toBeVisible();

  // The preset, then the worlds.
  await page.locator(`#preset-${preset}`).check();
  await page.locator('#setting-worlds').fill(String(worlds));

  // Advanced settings: the timers, and whether the new producer is announced.
  await page.locator('details.advanced summary').click();
  for (const field of ['practiceSeconds', 'earlyYearSeconds', 'laterYearSeconds']) {
    await page.locator(`#setting-timers-${field}`).fill(String(timerSeconds));
  }
  if (options.activitySeconds !== undefined) {
    const seconds = page.locator('[id^="activity-"][id$="-seconds"]');
    const count = await seconds.count();
    for (let i = 0; i < count; i += 1) {
      await seconds.nth(i).fill(String(options.activitySeconds));
    }
  }
  if (options.announceNewProducer === true) {
    await page.locator('#setting-newProducer-announced').check();
  }
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Settings saved.' }).first(),
  ).toBeVisible();

  // Back to the screen the lesson is run from.
  await page.getByRole('link', { name: 'Back to the start screen' }).click();
  await expect(page.getByRole('heading', { name: 'Step 5 Start' })).toBeVisible();

  // The keys and the codes, read the way a teacher reads a printed card.
  const sessionId = await newestSessionId(server);
  const state = await server.savedState(sessionId);
  expect(state.settings.worlds).toBe(worlds);

  return {
    server,
    instructor,
    sessionId,
    instructorKey: state.instructorKey,
    projectorKey: state.projectorKey,
    teams: Object.values(state.teams)
      .sort((x, y) => x.teamId.localeCompare(y.teamId))
      .map((team) => ({
        teamId: team.teamId,
        joinCode: team.joinCode,
        letter: team.letter,
        worldNumber: team.worldNumber,
      })),
  };
}

/** The session a terminal would find: the newest one open on this computer. */
export async function newestSessionId(server: GameServer): Promise<string> {
  const response = await fetch(`${server.url}/api/sessions`);
  const body = (await response.json()) as OpenSessionsResponse;
  const newest = [...body.sessions].sort((x, y) => y.createdAt - x.createdAt)[0];
  if (!newest) throw new Error('no session is open on that server');
  return newest.sessionId;
}

/**
 * The label on the one big button right now.
 *
 * Read with textContent rather than innerText, because the button's label is
 * uppercased by CSS and innerText would hand back the shouted version. The
 * arrow after the words is a visual affordance and not part of what the button
 * says, so it is dropped too.
 */
export function readLabel(text: string | null): string {
  return (text ?? '').replace(/▸/g, '').replace(/\s+/g, ' ').trim();
}

export async function bigButtonLabel(page: Page): Promise<string> {
  const button = page.getByRole('group', { name: 'The next step' }).getByRole('button');
  return readLabel(await button.textContent());
}

/**
 * Presses the one big button and confirms, the way a teacher does.
 *
 * It returns the label it pressed, so a test can assert on the order of the
 * lesson rather than on the phase names, which no teacher ever sees.
 *
 * The retry is not papering over anything. A timer can close a year while the
 * confirmation is open, and the dashboard then refuses to do the newer step on
 * the strength of a question that asked about the older one: it says "the
 * lesson has already moved on" and does nothing. A teacher presses OK and
 * presses the big button again, so that is what this does. Three goes, because
 * two coincidences in a row is a real problem and should fail.
 */
export async function pressBigButton(page: Page): Promise<string> {
  const label = await pressBigButtonSaying(page);
  if (label === null) throw new Error('the big button was not pressed');
  return label;
}

/**
 * Presses the big button, but only while it still says what it said.
 *
 * `expected` is the label the caller has just read and decided on. The button
 * is read again immediately before the click, and if the dashboard has had a
 * new view in between - a year closing on its own timer, say - nothing is
 * pressed and null comes back, so the caller can look again. Without that, a
 * loop can read "Next briefing screen", press a moment later when the button
 * has become "Start the practice year", and sail straight past the step it was
 * waiting for. That is how `pressUntil` used to march a lesson from the lobby
 * to the end of the game in one call.
 *
 * The retry inside handles the other half of the same race: if the view lands
 * while the confirmation is open, the dashboard refuses to do the newer step
 * and says "the lesson has already moved on". A teacher presses OK and tries
 * again, so that is what this does.
 */
export async function pressBigButtonSaying(page: Page, expected?: string): Promise<string | null> {
  const button = page.getByRole('group', { name: 'The next step' }).getByRole('button');
  const dialog = page.getByRole('dialog');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(button).toBeEnabled();
    const label = readLabel(await button.textContent());
    if (expected !== undefined && label !== expected) return null;

    await button.click();
    await expect(dialog).toBeVisible();

    const movedOn = dialog.getByRole('heading', { name: 'The lesson has already moved on' });
    if (await movedOn.isVisible()) {
      await dialog.getByRole('button', { name: 'OK' }).first().click();
      await expect(dialog).toBeHidden();
      if (expected !== undefined) return null;
      continue;
    }

    await dialog.getByRole('button', { name: /^Yes,/ }).click();
    await expect(dialog).toBeHidden();
    return label;
  }
  throw new Error('The lesson moved on under the big button three times in a row.');
}

/** Presses the big button until its label is the one asked for, then stops. */
export async function pressUntil(page: Page, wanted: RegExp, limit = 60): Promise<string[]> {
  const pressed: string[] = [];
  for (let i = 0; i < limit; i += 1) {
    const label = await bigButtonLabel(page);
    if (wanted.test(label)) return pressed;
    // Only presses if the button still says `label`, so the step that runs is
    // always one this loop has just looked at and decided against.
    const done = await pressBigButtonSaying(page, label);
    if (done !== null) pressed.push(done);
  }
  throw new Error(
    `The big button never said something matching ${String(wanted)}. It offered: ${pressed.join(' / ')}`,
  );
}

// ---------------------------------------------------------------------------
// A team terminal.
// ---------------------------------------------------------------------------

/** Opens a terminal, types the code, confirms the country and types names. */
export async function claimTeam(
  browser: Browser,
  lesson: Lesson,
  team: Lesson['teams'][number],
  names: string[] = ['Ada', 'Ben'],
): Promise<TeamScreen> {
  const screen = await openScreen(browser, `${lesson.server.url}/join`);
  const page = screen.page;

  await page.locator('#join-code').fill(team.joinCode);
  await page.getByRole('button', { name: 'This is our code' }).click();

  // "You are World 2 - Borvia (B). Is that right?" (SPEC 8.2)
  const heading = page.getByRole('heading', { name: /^You are World .* Is that right\?$/ });
  await expect(heading).toBeVisible();
  const label = (await heading.innerText())
    .replace(/^You are /, '')
    .replace(/\. Is that right\?$/, '');
  expect(label).toContain(`World ${String(team.worldNumber)}`);
  expect(label).toContain(`(${team.letter})`);

  await page.getByRole('button', { name: 'Yes, that is us' }).click();

  await expect(page.getByRole('heading', { name: 'Who is in your group?' })).toBeVisible();
  for (const [index, name] of names.entries()) {
    await page.locator(`#member-${String(index)}`).fill(name);
  }
  await page.getByRole('button', { name: 'Save and start' }).click();

  // The terminal lands on its own screen, with its country in the header.
  await expect(page.locator('.page-team')).toBeVisible();
  return { ...screen, ...team, label };
}

/** Types a number into the decision box and submits it, confirming. */
export async function submitDecision(screen: TeamScreen, value: string): Promise<void> {
  const page = screen.page;
  const field = page.getByRole('textbox', { name: 'Million barrels' });
  await expect(field).toBeEnabled();
  await field.fill(value);
  await page.getByRole('button', { name: /^Submit( the new number)?$/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Yes, submit' }).click();
  await expect(page.locator('.decision-done')).toContainText(
    `Submitted: ${value} million barrels.`,
  );
}

/** Opens the decision box again, for a group that wants to change its mind. */
export async function reopenDecision(screen: TeamScreen): Promise<void> {
  const change = screen.page.getByRole('button', { name: 'Change' });
  if (await change.isVisible()) await change.click();
}

/** Waits until this terminal is showing the year the dashboard has opened. */
export async function waitForYear(screen: TeamScreen, label: string): Promise<void> {
  const wanted = label === 'PRACTICE' ? 'PRACTICE' : label.replace('Year ', '');
  await expect(screen.page.locator('.team-year')).toHaveText(wanted, { timeout: 30_000 });
}

/** Everything every screen complained about, as one list. */
export function allProblems(screens: Screen[]): string[] {
  return screens.flatMap((screen) =>
    screen.problems.map((problem) => `${describe(screen)}: ${problem}`),
  );
}

function describe(screen: Screen): string {
  const team = screen as Partial<TeamScreen>;
  return team.teamId ?? screen.page.url();
}

/** The saved state, for the privacy scan and the final checks. */
export async function savedState(lesson: Lesson): Promise<SessionState> {
  return lesson.server.savedState(lesson.sessionId);
}
