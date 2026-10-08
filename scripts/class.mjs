/**
 * npm run class - the one command a teacher runs on the day.
 *
 * It does the four checks a lesson depends on (Node, somewhere to save, a build
 * that matches the source, a free port), starts the server on every network the
 * laptop is on, prints the addresses the room needs with a QR code, opens the
 * dashboard, and then stays out of the way until Ctrl+C.
 *
 * Everything it prints is written for someone who does not want to know what a
 * port is. When something is wrong it says what to do about it in one sentence
 * and stops; it never shows a stack trace in front of a class.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import QRCode from 'qrcode';
import {
  CheckFailed,
  REPO_ROOT,
  buildIsCurrent,
  dataFolderCheck,
  firstFreePort,
  isFirstStart,
  localAddresses,
  nodeVersionCheck,
  rememberStart,
} from './preflight.mjs';

const DEFAULT_PORT = 3000;
const DATA_DIR = join(REPO_ROOT, 'data');
const CLIENT_DIR = join(REPO_ROOT, 'dist', 'client');
const SERVER_ENTRY = join(REPO_ROOT, 'dist', 'server', 'index.js');

// ---------------------------------------------------------------------------
// Options.
// ---------------------------------------------------------------------------

function parseOptions(argv) {
  const flag = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const asked = flag('port') ?? process.env['PORT'];
  const port = asked === undefined ? DEFAULT_PORT : Number(asked);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new CheckFailed('--port has to be a whole number between 1024 and 65535.');
  }
  return { port, open: !argv.includes('--no-open') };
}

// ---------------------------------------------------------------------------
// Printing.
// ---------------------------------------------------------------------------

const line = (char = '-') => char.repeat(66);

function heading(text) {
  console.log(`\n${line('=')}\n${text}\n${line('=')}`);
}

async function printQr(url) {
  try {
    const art = await QRCode.toString(url, { type: 'terminal', small: true });
    console.log(art);
  } catch {
    // A terminal that cannot draw it still has the address printed above.
    console.log('(This terminal could not draw the QR code. Type the address instead.)');
  }
}

/** The reminder that no program can enforce for itself. */
function printSleepReminder() {
  const where = {
    darwin:
      'Apple menu > System Settings > Lock Screen, and set "Turn display off on power adapter when inactive" to Never.',
    win32:
      'Start > Settings > System > Power & battery > Screen and sleep, and set both "When plugged in" options to Never.',
  };
  console.log('\nBefore the lesson, stop this computer going to sleep.');
  console.log('If it sleeps, every group loses its connection until it wakes.');
  console.log(
    `  ${where[platform()] ?? 'Open your power settings and turn sleep off while plugged in.'}`,
  );
  console.log('  Keep it plugged in, and keep the lid open.');
}

/** Said once, the first time this computer runs a class. */
function printFirewallHelp() {
  console.log('\nThe first time you start, this computer will ask about the network.');
  if (platform() === 'darwin') {
    console.log('  macOS asks "Do you want the application node to accept incoming network');
    console.log('  connections?" Click Allow. If you click Deny, no group can reach you.');
    console.log('  To change it later: System Settings > Network > Firewall > Options.');
  } else if (platform() === 'win32') {
    console.log('  Windows shows "Windows Defender Firewall has blocked some features".');
    console.log('  Tick "Private networks, such as my home or work network" and click');
    console.log('  "Allow access". You do not need the Public networks box.');
    console.log('  To change it later: Start > Settings > Network & internet > Windows Firewall.');
  } else {
    console.log('  If your computer has a firewall, allow incoming connections on this port');
    console.log('  for your local network.');
  }
  console.log('  Nothing is opened to the internet. This is only the room you are in.');
}

function printNoNetworkHelp() {
  console.log('\nThis computer is not on any network, so no other computer can reach it.');
  console.log('You can still try everything on this computer using the localhost address');
  console.log('above, but the groups cannot join.');
  console.log('\nTwo ways out:');
  console.log('  1. Join the school Wi-Fi, then stop this (Ctrl+C) and start again.');
  console.log('  2. Turn on the personal hotspot on your phone, join this computer to it,');
  console.log('     then have every group computer join the same hotspot. The groups use');
  console.log('     almost no data: nothing goes to the internet, they only talk to this');
  console.log('     computer. Stop this and start again once everyone is on the hotspot.');
}

// ---------------------------------------------------------------------------
// Opening a browser.
// ---------------------------------------------------------------------------

function openInBrowser(url) {
  const [command, args] =
    platform() === 'win32'
      ? ['cmd', ['/c', 'start', '""', url.replace(/&/g, '^&')]]
      : platform() === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true, shell: false });
    child.on('error', () => {
      console.log('\n(Could not open the browser for you. Open the instructor link above.)');
    });
    child.unref();
  } catch {
    console.log('\n(Could not open the browser for you. Open the instructor link above.)');
  }
}

// ---------------------------------------------------------------------------
// The build.
// ---------------------------------------------------------------------------

function build() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new CheckFailed(
              'The app could not be built, so it cannot start.\n' +
                'If you have just updated, run "npm install" and try again.',
            ),
          ),
    );
  });
}

// ---------------------------------------------------------------------------
// The one command.
// ---------------------------------------------------------------------------

async function main() {
  const options = parseOptions(process.argv.slice(2));

  heading('Crude Accord - getting this computer ready');

  console.log(nodeVersionCheck());
  console.log(await dataFolderCheck(DATA_DIR));

  const state = await buildIsCurrent();
  if (state.current) {
    console.log('The app is built and up to date. Good.');
  } else {
    console.log(`Building the app, because ${state.why}. This takes a few seconds.\n`);
    await build();
    console.log('\nBuilt. Good.');
  }

  const wanted = await firstFreePort(options.port);
  if (wanted !== options.port) {
    console.log(`Port ${String(options.port)} is in use, so this lesson is on ${String(wanted)}.`);
  } else {
    console.log(`Port ${String(wanted)} is free. Good.`);
  }

  const firstStart = await isFirstStart(DATA_DIR);
  if (firstStart) printFirewallHelp();

  // Imported here rather than at the top: until the build above has run there
  // may be no dist/server to import.
  const { createServer } = await import(pathToFileURL(SERVER_ENTRY).href);
  const { server, port } = await listen(createServer, wanted);
  await rememberStart(DATA_DIR);

  const addresses = localAddresses();
  const best = addresses[0];
  const joinOn = (host) => `http://${host}:${String(port)}/join`;

  heading('Ready. Here is what everyone types.');

  if (best) {
    console.log('\nGROUP COMPUTERS - write this on the board:\n');
    console.log(`    ${joinOn(best.address)}\n`);
    console.log('Each group then types the six-character code from its card.');
    console.log('Or they can scan this and type only the code:\n');
    await printQr(joinOn(best.address));
  }

  console.log('\nEvery address this computer can be reached on:');
  console.log(`  ${joinOn('localhost')}   (this computer only)`);
  for (const entry of addresses) {
    const note = entry.rank === 0 ? '   (this network looks broken - try another)' : '';
    console.log(`  ${joinOn(entry.address)}   (${entry.name})${note}`);
  }
  if (addresses.length > 1) {
    console.log('\nIf the first one does not work, try the next. They are the same game.');
  }

  console.log('\nYOUR SCREENS (keep these to yourself):');
  console.log(`  Instructor   http://localhost:${String(port)}/instructor`);
  console.log('  Projector    the dashboard has a "Projector link" button for the second screen');
  console.log(
    `  Network check (any computer in the room)   http://${best?.address ?? 'localhost'}:${String(port)}/check`,
  );

  const saved = resumableLinks(server, port);
  if (saved.length > 0) {
    console.log('\nA game is already saved on this computer. The dashboard opens it by itself,');
    console.log('and if you ever lose the tab this link gets you back in:');
    for (const link of saved) console.log(`  ${link}`);
  }

  if (!best) printNoNetworkHelp();
  printSleepReminder();

  console.log(`\nSaved in ${DATA_DIR}`);
  console.log('Nothing is sent to the internet. Everything stays on this computer.');
  console.log(`\n${line()}`);
  console.log('Leave this window open for the whole lesson.');
  console.log('When you are finished, come back here and press Ctrl+C.');
  console.log(line());

  if (options.open) openInBrowser(`http://localhost:${String(port)}/instructor`);

  stopOnSignal(server);
}

/**
 * Starts the server, stepping on past a port that was taken a moment ago.
 *
 * The free-port check and the listen are two separate moments, and in between
 * something else on the laptop can take the port. That is rare and it is also
 * the sort of thing that happens exactly once, in front of a class, so it is
 * handled rather than reported.
 */
async function listen(createServer, from) {
  for (let port = from; port < from + 10; port += 1) {
    try {
      const server = await createServer({
        port,
        host: '0.0.0.0',
        dataDir: DATA_DIR,
        clientDir: CLIENT_DIR,
        logger: (message) => {
          console.log(`[note] ${message}`);
        },
      });
      if (port !== from) {
        console.log(`Port ${String(from)} went busy, so this lesson is on ${String(port)}.`);
      }
      return { server, port };
    } catch (err) {
      if (err?.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new CheckFailed(
    [
      `Ports ${String(from)} to ${String(from + 9)} were all taken by the time the game started.`,
      'Close anything else you have running and start again, or pick a port yourself with:',
      '  npm run class -- --port=8080',
    ].join('\n'),
  );
}

/**
 * The full instructor link for anything already saved here.
 *
 * The key is in it, which is why this is only ever printed in the teacher's own
 * terminal on the teacher's own computer - the same place npm run demo prints
 * it. It earns its place after a laptop restart: the dashboard remembers the
 * game in that browser, but if the browser was reset the key is here.
 */
function resumableLinks(server, port) {
  try {
    return server.store
      .sessionIds()
      .map((id) => server.store.get(id))
      .filter((state) => state !== undefined)
      .sort((x, y) => y.createdAt - x.createdAt)
      .slice(0, 2)
      .map(
        (state) =>
          `http://localhost:${String(port)}/instructor?s=${state.sessionId}&k=${state.instructorKey}`,
      );
  } catch {
    return [];
  }
}

/** Ctrl+C: finish saving, then go. */
function stopOnSignal(server) {
  let stopping = false;
  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(`\n\nStopping (${signal}). Finishing the last save, so nothing is lost.`);
    server
      .close()
      .then(() => {
        console.log('Stopped. Everything the class did is saved.');
        console.log('Start again with the same command and press Resume on the dashboard.');
        process.exit(0);
      })
      .catch((err) => {
        console.error(`Something went wrong while stopping: ${String(err)}`);
        console.error('Your data is still on disk; nothing was deleted.');
        process.exit(1);
      });
  };
  process.on('SIGINT', () => stop('Ctrl+C'));
  process.on('SIGTERM', () => stop('SIGTERM'));

  // A lesson is worth more than a tidy crash: write it down and keep serving.
  process.on('unhandledRejection', (reason) => {
    console.error(`[note] something was not handled: ${String(reason)}`);
  });
  process.on('uncaughtException', (err) => {
    console.error(`[note] something went wrong but the game is still running: ${String(err)}`);
  });
}

main().catch((err) => {
  console.log(`\n${line()}`);
  console.log(
    err instanceof CheckFailed ? err.message : `Crude Accord could not start.\n${String(err)}`,
  );
  console.log(line());
  process.exit(1);
});
