import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type RunningServer } from '../../src/server/index.js';

describe('GET /api/health', () => {
  let server: RunningServer;

  beforeAll(async () => {
    // Port 0 means "any free port", so tests never clash with a running class.
    server = await createServer({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    await server.close();
  });

  it('listens on a real port', () => {
    expect(server.port).toBeGreaterThan(0);
  });

  it('reports ok, name and version', async () => {
    const res = await fetch(`http://127.0.0.1:${String(server.port)}/api/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean; name: string; version: string };
    expect(body.ok).toBe(true);
    expect(body.name).toBe('crude-accord');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
