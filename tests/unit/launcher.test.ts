/**
 * The checks npm run class runs before a lesson.
 *
 * Each of these is something that has gone wrong on somebody's laptop: an old
 * Node, a folder that cannot be written to, a dist/ left over from last week,
 * a port something else already has, and a network that is not really there.
 * The launcher's job is to notice before a class does, so each check is tested
 * on the failing case as well as the passing one.
 */

import { createServer, type Server } from 'node:net';
import { chmod, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CheckFailed,
  buildIsCurrent,
  dataFolderCheck,
  firstFreePort,
  isFirstStart,
  localAddresses,
  nodeVersionCheck,
  portIsFree,
  rememberStart,
} from '../../scripts/preflight.mjs';

const made: string[] = [];
const listeners: Server[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'crude-accord-launcher-'));
  made.push(dir);
  return dir;
}

afterEach(async () => {
  for (const server of listeners.splice(0)) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const dir of made.splice(0)) await rm(dir, { recursive: true, force: true });
});

describe('the Node version check', () => {
  it('accepts the versions SPEC section 9 asks for', () => {
    expect(nodeVersionCheck('20.11.0')).toContain('20.11.0');
    expect(nodeVersionCheck('24.0.1')).toContain('24.0.1');
    expect(nodeVersionCheck()).toContain(process.versions.node);
  });

  it('turns an old Node into one instruction, not a stack trace', () => {
    try {
      nodeVersionCheck('18.19.0');
      throw new Error('an old Node should have stopped the launcher');
    } catch (err) {
      expect(err).toBeInstanceOf(CheckFailed);
      expect((err as Error).message).toContain('Node 18.19.0');
      expect((err as Error).message).toContain('nodejs.org');
    }
  });
});

describe('the data folder check', () => {
  it('makes the folder when it is missing, and leaves no probe behind', async () => {
    const dir = join(await tempDir(), 'data');
    const said = await dataFolderCheck(dir);

    expect(said).toContain(dir);
    expect(await isFirstStart(dir)).toBe(true);
  });

  it('says what to do when the folder cannot be written to', async () => {
    const parent = await tempDir();
    const dir = join(parent, 'locked');
    await mkdir(dir);
    await chmod(dir, 0o400);

    let message: string | null = null;
    try {
      await dataFolderCheck(dir);
    } catch (err) {
      message = (err as Error).message;
    } finally {
      await chmod(dir, 0o700);
    }

    // Windows ignores the read-only bit for the account that owns the folder,
    // so there the write genuinely succeeds and there is nothing to report.
    if (message !== null) {
      expect(message).toContain('cannot save anything');
      expect(message).toContain('Documents folder');
    }
  });
});

describe('the build freshness check', () => {
  async function fakeRepo(): Promise<string> {
    const root = await tempDir();
    await mkdir(join(root, 'dist', 'client'), { recursive: true });
    await mkdir(join(root, 'dist', 'server'), { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'package.json'), '{}');
    await writeFile(join(root, 'src', 'thing.ts'), 'export const a = 1;');
    await writeFile(join(root, 'dist', 'client', 'index.html'), '<!doctype html>');
    await writeFile(join(root, 'dist', 'server', 'index.js'), 'export {};');
    return root;
  }

  /**
   * Every timestamp is set by hand, including the source files.
   *
   * Leaving a file at whatever mtime the write gave it is a flake waiting to
   * happen: a real write carries sub-millisecond precision, and `utimes` only
   * takes whole milliseconds, so a file written and a file stamped inside the
   * same millisecond can come back in the wrong order.
   */
  const stamp = async (path: string, seconds: number) => {
    const when = new Date(Date.now() + seconds * 1000);
    await utimes(path, when, when);
  };

  const SOURCES = ['package.json', 'src/thing.ts'];
  const BUILT = ['dist/client/index.html', 'dist/server/index.js'];

  async function stampAll(root: string, sourceSeconds: number, builtSeconds: number) {
    for (const path of SOURCES) await stamp(join(root, path), sourceSeconds);
    for (const path of BUILT) await stamp(join(root, path), builtSeconds);
  }

  it('says nothing is built when dist is empty', async () => {
    const root = await tempDir();
    const state = await buildIsCurrent(root);
    expect(state.current).toBe(false);
    expect(state.why).toContain('nothing is built');
  });

  it('is happy when dist is newer than every source file', async () => {
    const root = await fakeRepo();
    await stampAll(root, -120, -60);

    expect((await buildIsCurrent(root)).current).toBe(true);
  });

  it('asks for a rebuild when a source file has changed since', async () => {
    const root = await fakeRepo();
    await stampAll(root, -120, -60);
    await stamp(join(root, 'src', 'thing.ts'), 0);

    const state = await buildIsCurrent(root);
    expect(state.current).toBe(false);
    expect(state.why).toContain('changed since it was built');
  });

  it('notices a change in a nested folder, not just the top of src', async () => {
    const root = await fakeRepo();
    await stampAll(root, -120, -60);
    await mkdir(join(root, 'src', 'deep', 'deeper'), { recursive: true });
    await writeFile(join(root, 'src', 'deep', 'deeper', 'thing.ts'), 'export const b = 2;');
    await stamp(join(root, 'src', 'deep', 'deeper', 'thing.ts'), 0);

    expect((await buildIsCurrent(root)).current).toBe(false);
  });

  it('asks for a rebuild when package.json has changed', async () => {
    const root = await fakeRepo();
    await stampAll(root, -120, -60);
    await stamp(join(root, 'package.json'), 0);

    expect((await buildIsCurrent(root)).current).toBe(false);
  });
});

describe('the port check', () => {
  async function occupy(): Promise<number> {
    const server = createServer();
    listeners.push(server);
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        const address = server.address();
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('no port'));
      });
    });
  }

  it('sees a port something else is already on', async () => {
    const taken = await occupy();
    expect(await portIsFree(taken)).toBe(false);
  });

  it('moves to the next port rather than asking the teacher about ports', async () => {
    const taken = await occupy();
    const chosen = await firstFreePort(taken);
    expect(chosen).toBeGreaterThan(taken);
  });

  it('explains how to pick a port when a whole run of them is busy', async () => {
    const taken = await occupy();
    try {
      await firstFreePort(taken, '0.0.0.0', 1);
      throw new Error('one busy port with one try should have stopped the launcher');
    } catch (err) {
      expect(err).toBeInstanceOf(CheckFailed);
      expect((err as Error).message).toContain('--port=8080');
    }
  });
});

describe('remembering that this computer has started before', () => {
  it('is only the first start once', async () => {
    const dir = await tempDir();
    expect(await isFirstStart(dir)).toBe(true);
    await rememberStart(dir);
    expect(await isFirstStart(dir)).toBe(false);
  });
});

describe('the addresses the room can type', () => {
  const card = (name: string, address: string, internal = false) => ({
    name,
    entry: { family: 'IPv4', address, internal },
  });

  function listOf(...cards: ReturnType<typeof card>[]) {
    const out: Record<string, Array<{ family: string; address: string; internal: boolean }>> = {};
    for (const one of cards) (out[one.name] ??= []).push(one.entry);
    return out;
  }

  it('leaves out loopback and anything that is not IPv4', () => {
    const found = localAddresses({
      lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
      eth0: [{ family: 'IPv6', address: 'fe80::1', internal: false }],
    });
    expect(found).toEqual([]);
  });

  it('puts a normal classroom network first and a broken one last', () => {
    const found = localAddresses(
      listOf(
        card('Ethernet', '169.254.17.2'),
        card('Wi-Fi', '192.168.1.20'),
        card('Hotspot', '172.20.10.3'),
      ),
    );

    expect(found.map((one) => one.address)).toEqual([
      '172.20.10.3',
      '192.168.1.20',
      '169.254.17.2',
    ]);
    expect(found.at(-1)?.rank).toBe(0);
  });

  it('keeps the card name, so a teacher can tell Wi-Fi from a cable', () => {
    const found = localAddresses(listOf(card('Wi-Fi 2', '10.0.0.5')));
    expect(found[0]).toMatchObject({ name: 'Wi-Fi 2', address: '10.0.0.5', rank: 3 });
  });
});
