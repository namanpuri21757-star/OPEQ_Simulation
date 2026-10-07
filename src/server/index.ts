import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type Express } from 'express';
import { Server as IoServer } from 'socket.io';
import type { OpenSessionSummary, OpenSessionsResponse } from '../shared/protocol.js';
import type { SessionState } from '../shared/state.js';
import { attachExports } from './exports.js';
import { attachSockets, type SocketLayer } from './socket.js';
import { SessionStore, systemClock, type Clock } from './store/index.js';

/** The 1-second tick that closes overdue years (SPEC section 9). */
const TICK_MS = 1000;

/**
 * The largest socket frame the server will read.
 *
 * It has to sit ABOVE anything zod could refuse, not below it. Every text field
 * in the protocol has a maximum length, so a payload of a few hundred kilobytes
 * is certain to be refused - but only if the server reads it, because an
 * oversized frame is dropped by the socket with no ack at all, and a screen
 * waiting for an ack that will never come is worse than a clear "that is too
 * long". So the limit is a backstop against something absurd, and the refusing
 * is done by the schemas, which can say why (acceptance S1).
 */
const MAX_FRAME_BYTES = 512 * 1024;

export interface CreateServerOptions {
  /** 0 asks the operating system for any free port, which is what tests want. */
  port?: number;
  host?: string;
  /** Folder holding the built client. Missing in dev; the Vite server serves it then. */
  clientDir?: string;
  /** Where sessions are saved. Tests pass a temporary folder. */
  dataDir?: string;
  /** Injected so a test can decide what time it is. */
  clock?: Clock;
  /** 0 turns the automatic tick off, so a test can call store.tick() itself. */
  tickMs?: number;
  /** Where warnings go. Tests collect them instead of printing. */
  logger?: (message: string) => void;
}

export interface RunningServer {
  app: Express;
  http: HttpServer;
  io: IoServer;
  store: SessionStore;
  sockets: SocketLayer;
  port: number;
  host: string;
  url: string;
  close(): Promise<void>;
}

const DEFAULT_CLIENT_DIR = fileURLToPath(new URL('../client', import.meta.url));
const PACKAGE_JSON = fileURLToPath(new URL('../../package.json', import.meta.url));

async function readVersion(): Promise<string> {
  try {
    const raw = await readFile(PACKAGE_JSON, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && 'version' in parsed) {
      const { version } = parsed as { version?: unknown };
      if (typeof version === 'string') return version;
    }
  } catch {
    // Version is only ever shown for troubleshooting, so a missing file is fine.
  }
  return '0.0.0';
}

export async function createServer(options: CreateServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '0.0.0.0';
  const clientDir = options.clientDir ?? DEFAULT_CLIENT_DIR;
  const version = await readVersion();
  const dataDir = options.dataDir ?? process.env['DATA_DIR'] ?? './data';

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, name: 'crude-accord', version });
  });

  // A printed join code names a team, not a session, so a terminal has to learn
  // which session is open on this computer before it can say hello (SPEC 8.2).
  // Read-only and deliberately tiny: no keys, no team ids, no join codes.
  app.get('/api/sessions', (_req, res) => {
    const sessions: OpenSessionSummary[] = store
      .sessionIds()
      .map((id) => store.get(id))
      .filter((state): state is SessionState => state !== undefined)
      .sort((x, y) => y.createdAt - x.createdAt)
      .map((state) => ({
        sessionId: state.sessionId,
        createdAt: state.createdAt,
        phase: state.phase,
        anyFree: Object.values(state.teams).some((team) => !team.claimed),
      }));
    res.json({ sessions } satisfies OpenSessionsResponse);
  });

  // The built client is a single page app: unknown paths must return index.html
  // so a reload on /team or /instructor still works.
  const indexHtml = `${clientDir}/index.html`;
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir, { index: false }));
  }
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
    if (!existsSync(indexHtml)) {
      res.status(503).type('text/plain').send('The client is not built yet. Run npm run build.');
      return;
    }
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });

  const http = createHttpServer(app);
  // Both transports, because some school networks block plain WebSocket.
  //
  // maxHttpBufferSize is set explicitly rather than left at the default, so the
  // number has a reason next to it. See MAX_FRAME_BYTES above.
  const io = new IoServer(http, {
    transports: ['websocket', 'polling'],
    maxHttpBufferSize: MAX_FRAME_BYTES,
  });

  const store = new SessionStore({
    dataDir,
    clock: options.clock ?? systemClock,
    ...(options.logger ? { logger: options.logger } : {}),
  });
  // Anything already saved comes back before the first client can connect.
  await store.loadAll();
  // Registered after the single-page-app fallback, which passes /api/ straight
  // through, so the download links still reach this route.
  attachExports(app, store);
  const sockets = attachSockets(io, store);

  const tickMs = options.tickMs ?? TICK_MS;
  const ticker =
    tickMs > 0
      ? setInterval(() => {
          store.tick().catch((err: unknown) => {
            store.log(`The clock tick failed: ${String(err)}`);
          });
        }, tickMs)
      : null;
  // The tick must never hold the process open on its own.
  ticker?.unref?.();

  const port = await new Promise<number>((resolve, reject) => {
    http.once('error', reject);
    http.listen(options.port ?? 0, host, () => {
      const address = http.address();
      if (address && typeof address === 'object') resolve(address.port);
      else reject(new Error('The server started but reported no port.'));
    });
  });

  const close = async (): Promise<void> => {
    if (ticker) clearInterval(ticker);
    sockets.close();
    await store.close();

    // Socket.IO closes the HTTP server it is attached to, so closing the HTTP
    // server afterwards may report "not running". That is not a failure.
    await new Promise<void>((resolve) => {
      io.close(() => {
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      if (!http.listening) {
        resolve();
        return;
      }
      http.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return {
    app,
    http,
    io,
    store,
    sockets,
    port,
    host,
    url: `http://localhost:${String(port)}`,
    close,
  };
}

/**
 * Running this file directly (npm start) starts the real classroom server.
 * Importing it (tests, npm run class) does not, so tests can pick their own port.
 */
const entry = process.argv[1];
const isDirectRun = entry !== undefined && import.meta.url === pathToFileURL(entry).href;

if (isDirectRun) {
  const port = Number(process.env['PORT'] ?? 3000);
  createServer({ port })
    .then((server) => {
      console.log(`Crude Accord is listening on ${server.url}`);

      let stopping = false;
      const stop = (signal: string) => {
        if (stopping) return;
        stopping = true;
        console.log(`\nGot ${signal}. Stopping, so nothing is half saved.`);
        server
          .close()
          .then(() => process.exit(0))
          .catch((err: unknown) => {
            console.error(err);
            process.exit(1);
          });
      };
      process.on('SIGINT', () => stop('SIGINT'));
      process.on('SIGTERM', () => stop('SIGTERM'));

      // A lesson is worth more than a tidy crash. Anything that escapes is
      // written down and the server keeps serving; everything that matters is
      // already on disk, because nothing is broadcast before it is saved.
      process.on('unhandledRejection', (reason) => {
        console.error(`Something was not handled: ${String(reason)}`);
      });
      process.on('uncaughtException', (err) => {
        console.error(`Something went wrong but the game is still running: ${String(err)}`);
      });
    })
    .catch((err: unknown) => {
      console.error('The server could not start.');
      console.error(err);
      process.exit(1);
    });
}
