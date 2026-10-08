/**
 * O1 - the offline guarantee: no page ever asks the internet for anything.
 *
 * SPEC section 9 says "no internet at runtime: no CDNs, no web fonts from the
 * internet, no analytics, no external calls". That is not a code-review rule,
 * it is the difference between a lesson that runs on a phone hotspot and a
 * lesson that does not run at all, so it is tested the only way that settles
 * it: build the app, serve it, drive every screen a lesson uses in a real
 * browser, and fail on the first request that goes anywhere but this server.
 *
 * The browsers see the built app (npm run e2e builds first), so this covers
 * whatever the bundler put in dist/ and not just what the source says.
 *
 * It fails on the URL itself, not on whether the request succeeded: a font
 * request that times out behind a school firewall is still a page that needed
 * the internet, and on the teacher's own laptop at home it would have worked
 * and nobody would have noticed.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { GameServer } from './support/server.js';
import {
  claimTeam,
  createLesson,
  openScreen,
  openTab,
  pressBigButton,
  pressUntil,
  submitDecision,
  waitForYear,
  type Screen,
} from './support/room.js';

const CLIENT_DIR = fileURLToPath(new URL('../../dist/client', import.meta.url));

/**
 * Schemes that never reach the network.
 *
 * `data:` and `blob:` are the app's own bytes (the QR codes are drawn in the
 * browser, and a CSV download is a blob it made). `about:blank` is a new tab
 * before it has gone anywhere.
 */
const LOCAL_SCHEMES = ['data:', 'blob:', 'about:'];

/** http, https and the two WebSocket schemes all reach the network. */
const NETWORK_SCHEMES = ['http:', 'https:', 'ws:', 'wss:'];

/**
 * Whether a URL stays on this computer.
 *
 * Compared by host and port rather than by the whole address, because the
 * Socket.IO connection arrives as `ws://127.0.0.1:49268/socket.io/...` - the
 * same server, a different scheme. A different port on the same machine is
 * still a stranger: that would be some other program, not this one.
 */
function isLocal(url: string, hosts: readonly string[]): boolean {
  if (LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme))) return true;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (!NETWORK_SCHEMES.includes(parsed.protocol)) return false;
  return hosts.includes(parsed.host);
}

/** Every request from every screen that did not stay on this server. */
function offSite(screens: readonly Screen[], hosts: readonly string[]): string[] {
  const out = new Set<string>();
  for (const screen of screens) {
    for (const url of screen.requests) {
      if (!isLocal(url, hosts)) out.add(url);
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// The built files, read as text.
// ---------------------------------------------------------------------------

/**
 * An absolute URL in a place that would make the browser fetch it.
 *
 * Only index.html and the stylesheets are scanned this way. The JavaScript
 * bundle is full of absolute URLs that are never fetched - XML namespaces, the
 * `$schema` strings inside zod, and the "read more" links in React's and
 * Socket.IO's own error messages - so grepping it would fail on things that are
 * not requests. What the bundle actually asks for is covered by the browser
 * part of this test, which is the stronger check anyway.
 */
const FETCHING_PATTERNS = [
  /\bsrc\s*=\s*["']https?:/gi,
  /\bhref\s*=\s*["']https?:/gi,
  /\burl\(\s*["']?https?:/gi,
  /@import\s+(?:url\()?\s*["']?https?:/gi,
  // A protocol-relative URL: "//fonts.googleapis.com/..." inherits the scheme.
  /\b(?:src|href)\s*=\s*["']\/\//gi,
];

async function filesIn(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesIn(full)));
    else out.push(full);
  }
  return out;
}

async function externalReferencesInMarkup(): Promise<string[]> {
  const files = (await filesIn(CLIENT_DIR)).filter(
    (path) => path.endsWith('.html') || path.endsWith('.css'),
  );
  const found: string[] = [];
  for (const path of files) {
    const text = await readFile(path, 'utf8');
    for (const pattern of FETCHING_PATTERNS) {
      for (const match of text.matchAll(pattern)) found.push(`${path}: ${match[0]}`);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The test.
// ---------------------------------------------------------------------------

test.describe('O1 - offline guarantee', () => {
  test('no screen in a whole lesson asks for anything off this server', async ({ browser }) => {
    const server = await GameServer.start();
    const opened: Screen[] = [];

    // The browsers reach the server as 127.0.0.1; localhost is the same
    // computer under its other name, which is what npm run class opens.
    const hosts = [`127.0.0.1:${String(server.port)}`, `localhost:${String(server.port)}`];

    try {
      // --- the pages that exist before any game does ------------------------

      const landing = await openScreen(browser, `${server.url}/`);
      opened.push(landing);

      const beforeJoin = await openScreen(browser, `${server.url}/join`);
      opened.push(beforeJoin);

      // --- a lesson ---------------------------------------------------------

      const lesson = await createLesson(browser, server, {
        worlds: 1,
        preset: 'test-fast',
        timerSeconds: 900,
        activitySeconds: 900,
      });
      opened.push(lesson.instructor);
      const dash = lesson.instructor.page;

      // The lobby draws a QR code on this computer, with no internet (SPEC 8.4).
      await expect(dash.getByRole('img', { name: /^QR code for/ })).toBeVisible();

      // The printable pages, which are the ones most likely to want a web font.
      const cards = await openTab(lesson.instructor, `${server.url}/instructor/cards`);
      opened.push(cards);
      await expect(cards.page.locator('li.card').first()).toBeVisible();

      const materials = await openTab(lesson.instructor, `${server.url}/instructor/materials`);
      opened.push(materials);
      await expect(materials.page.getByRole('heading', { level: 1 })).toBeVisible();

      const projector = await openScreen(
        browser,
        `${server.url}/projector/${lesson.sessionId}?k=${lesson.projectorKey}`,
      );
      opened.push(projector);

      const check = await openScreen(browser, `${server.url}/check`);
      opened.push(check);
      await check.page.getByRole('button', { name: /the check$/ }).click();
      await expect(check.page.locator('.check-result')).toBeVisible({ timeout: 60_000 });

      // --- three terminals, a practice year, a scored year, a chat window ---

      const terminals = [];
      for (const team of lesson.teams) {
        const terminal = await claimTeam(browser, lesson, team);
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

      for (const terminal of terminals) await submitDecision(terminal, '40.0');
      await pressUntil(dash, /^Close Year 1$/);
      await pressBigButton(dash);
      await expect(first.page.locator('.reveal-price')).toBeVisible();

      await pressUntil(dash, /^Open chat window/);
      await pressBigButton(dash);
      await first.page.getByLabel('Write to the other countries in your world').fill('Hello.');
      await first.page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(first.page.locator('.message-list')).toContainText('Hello.');
      await pressBigButton(dash);

      // --- the end, the debrief and the print-friendly summary --------------

      await pressUntil(dash, /^End the game$/);
      await pressBigButton(dash);
      await pressBigButton(dash);
      await expect(dash.getByRole('heading', { name: 'Debrief' })).toBeVisible();

      await dash.getByRole('button', { name: 'Show on projector' }).click();
      await expect(projector.page.locator('.debrief-screen')).toBeVisible({ timeout: 20_000 });

      const summary = await openTab(lesson.instructor, `${server.url}/instructor/summary`);
      opened.push(summary);
      await expect(summary.page.getByRole('heading', { level: 1 })).toBeVisible();

      // --- the verdict ------------------------------------------------------

      const strangers = offSite(opened, hosts);
      expect(
        strangers.join('\n'),
        '\nA screen asked for something that is not on this computer. In a classroom with no internet, that request fails.',
      ).toBe('');

      // Something really was recorded, so a silent listener cannot pass this.
      const total = opened.reduce((sum, screen) => sum + screen.requests.length, 0);
      expect(total).toBeGreaterThan(opened.length);
      // And a WebSocket was among them, so the socket URL is covered too.
      expect(
        opened.flatMap((screen) => screen.requests).some((url) => url.includes('socket.io')),
      ).toBe(true);
    } finally {
      // Several of these are tabs on the instructor's computer, so the same
      // context turns up twice; closing it twice is not an error.
      for (const context of new Set(opened.map((screen) => screen.context))) {
        await context.close();
      }
      await server.cleanup();
    }
  });

  test('the built markup asks for no font, stylesheet or script from the internet', async () => {
    const found = await externalReferencesInMarkup();
    expect(found.join('\n'), '\nThe built app refers to something on the internet.').toBe('');
  });
});
