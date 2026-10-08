/**
 * The four things that have to be true before a lesson can start.
 *
 * Each check is a small function that returns a line to print and, when
 * something is wrong, either fixes it or says in one sentence what the teacher
 * has to do. Nothing here throws a stack trace: this runs in front of a class.
 *
 * It lives apart from class.mjs so a test can call the checks without starting
 * a server, and so the launcher reads as a list of steps rather than a wall of
 * filesystem code.
 */

import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import { constants } from 'node:fs';
import { access, mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MIN_NODE_MAJOR = 20;

/** A finished check: a line for the terminal, and whether it stops the lesson. */
export class CheckFailed extends Error {}

// ---------------------------------------------------------------------------
// Node version.
// ---------------------------------------------------------------------------

export function nodeVersionCheck(version = process.versions.node) {
  const major = Number(version.split('.')[0]);
  if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
    throw new CheckFailed(
      `This computer is running Node ${version}, and Crude Accord needs Node ${String(MIN_NODE_MAJOR)} or newer.\n` +
        'Install the latest "LTS" version from https://nodejs.org, then start again.',
    );
  }
  return `Node ${version}. Good.`;
}

// ---------------------------------------------------------------------------
// The data folder.
// ---------------------------------------------------------------------------

/**
 * Makes the data folder if it is missing and proves a file can be written.
 *
 * Every decision a class makes is appended and fsynced before anything is sent
 * to a screen (CLAUDE.md rule 5), so a folder that cannot be written to is not
 * a degraded lesson - it is no lesson. Better to find out now than in Year 1.
 */
export async function dataFolderCheck(dataDir) {
  try {
    await mkdir(dataDir, { recursive: true });
    const probe = join(dataDir, '.write-probe');
    await writeFile(probe, 'ok');
    await unlink(probe);
  } catch (err) {
    throw new CheckFailed(
      `Crude Accord cannot save anything in ${dataDir}.\n` +
        `The computer said: ${err instanceof Error ? err.message : String(err)}\n` +
        'Copy the project folder somewhere you own, such as your Documents folder, and start again.',
    );
  }
  return `Saving to ${dataDir}. Good.`;
}

// ---------------------------------------------------------------------------
// Is the build up to date?
// ---------------------------------------------------------------------------

/** The newest change time under a folder, ignoring anything uninteresting. */
async function newestUnder(dir) {
  let newest = 0;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, await newestUnder(full));
    } else {
      const info = await stat(full);
      newest = Math.max(newest, info.mtimeMs);
    }
  }
  return newest;
}

async function mtimeOf(path) {
  try {
    const info = await stat(path);
    return info.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Whether dist/ was built from the source that is on disk now.
 *
 * Timestamps rather than hashes: this has to answer in well under a second on a
 * school laptop, and the cost of being wrong is one extra build, not a wrong
 * lesson. The two files checked are the ones each half of the build writes
 * last-ish, and anything newer in src/ or in a config file means rebuild.
 */
export async function buildIsCurrent(root = REPO_ROOT) {
  const client = await mtimeOf(join(root, 'dist', 'client', 'index.html'));
  const server = await mtimeOf(join(root, 'dist', 'server', 'index.js'));
  if (client === 0 || server === 0) return { current: false, why: 'nothing is built yet' };

  const built = Math.min(client, server);
  const sources = [
    await newestUnder(join(root, 'src')),
    await mtimeOf(join(root, 'package.json')),
    await mtimeOf(join(root, 'vite.config.ts')),
    await mtimeOf(join(root, 'tsconfig.base.json')),
    await mtimeOf(join(root, 'tsconfig.server.json')),
  ];
  const newestSource = Math.max(...sources);
  if (newestSource > built)
    return { current: false, why: 'the app has changed since it was built' };
  return { current: true, why: 'the build matches the source' };
}

// ---------------------------------------------------------------------------
// The port.
// ---------------------------------------------------------------------------

/** True when nothing else on this computer is already using that port. */
export function portIsFree(port, host = '0.0.0.0') {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.listen(port, host, () => {
      probe.close(() => resolve(true));
    });
  });
}

/**
 * The first free port from the one asked for (SPEC section 9).
 *
 * A laptop that already has something on 3000 is normal, and a teacher should
 * never have to know what a port is. Ten tries, then say so plainly.
 */
export async function firstFreePort(from, host = '0.0.0.0', tries = 10) {
  for (let port = from; port < from + tries; port += 1) {
    if (await portIsFree(port, host)) return port;
  }
  throw new CheckFailed(
    `Ports ${String(from)} to ${String(from + tries - 1)} are all busy on this computer.\n` +
      'Close anything else you have running and start again, or pick a port yourself with:\n' +
      '  npm run class -- --port=8080',
  );
}

// ---------------------------------------------------------------------------
// Has this computer been through the firewall question before?
// ---------------------------------------------------------------------------

const MARKER = '.started-before';

export async function isFirstStart(dataDir) {
  try {
    await access(join(dataDir, MARKER), constants.F_OK);
    return false;
  } catch {
    return true;
  }
}

export async function rememberStart(dataDir) {
  try {
    await writeFile(join(dataDir, MARKER), new Date().toISOString());
  } catch {
    // The only cost of failing here is seeing the firewall advice twice.
  }
}

// ---------------------------------------------------------------------------
// Addresses.
// ---------------------------------------------------------------------------

/**
 * How good an address is for a classroom, highest first.
 *
 * A home or school Wi-Fi hands out a 192.168 or a 10. address, and a phone
 * hotspot usually a 172.20. A 169.254 address means this computer asked for an
 * address and nobody answered, so it is on a cable or a network that is not
 * really working - worth printing, but last, and with a word about it.
 */
function rank(address) {
  if (address.startsWith('192.168.')) return 3;
  if (address.startsWith('10.')) return 3;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) return 3;
  if (address.startsWith('169.254.')) return 0;
  return 1;
}

/** Every IPv4 address another computer in the room could type. */
export function localAddresses(interfaces = networkInterfaces()) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const entry of list ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      out.push({ name, address: entry.address, rank: rank(entry.address) });
    }
  }
  return out.sort((x, y) => y.rank - x.rank || x.address.localeCompare(y.address));
}
