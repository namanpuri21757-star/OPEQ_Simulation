/**
 * Downloading the exports (SPEC 8.4 Exports).
 *
 * They go over HTTP rather than over the socket for one reason: a download is a
 * link, and a link is the only way a browser will save a file to disk with a
 * name on it and no internet involved. The files themselves are built by the
 * pure functions in src/shared/exports.ts, so this file only checks who is
 * asking and sets the headers.
 *
 * The instructor key is required, the same key the dashboard already holds. The
 * projector key gets nothing: a room screen has no business downloading the
 * class's messages.
 */

import type { Express, Request, Response } from 'express';
import { CSV_BOM } from '../shared/csv.js';
import { EXPORT_FILES, exportFile } from '../shared/exports.js';
import type { SessionStore } from './store/index.js';

/** The path the dashboard builds its download links from. */
export function exportPath(sessionId: string, name: string): string {
  return `/api/sessions/${encodeURIComponent(sessionId)}/export/${encodeURIComponent(name)}`;
}

/** A route parameter as one string. Express types them as possibly repeated. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? (value[0] ?? '') : '';
}

function keyFrom(req: Request): string {
  const value = req.query['k'];
  return typeof value === 'string' ? value : '';
}

/** A file name a teacher can find again on Monday. */
function downloadName(sessionId: string, fileName: string): string {
  return `crude-accord-${sessionId}-${fileName}`;
}

export function attachExports(app: Express, store: SessionStore): void {
  app.get('/api/sessions/:sessionId/export/:name', (req: Request, res: Response) => {
    const sessionId = param(req, 'sessionId');
    const state = store.get(sessionId);
    if (!state) {
      res.status(404).json({ ok: false, message: 'That session is not open on this computer.' });
      return;
    }
    if (keyFrom(req) !== state.instructorKey) {
      res.status(403).json({ ok: false, message: 'That link needs the instructor key.' });
      return;
    }

    const name = param(req, 'name');
    const file = exportFile(name);
    if (!file) {
      res.status(404).json({
        ok: false,
        message: `There is no export called "${name}". Try one of: ${EXPORT_FILES.map((f) => f.name).join(', ')}.`,
      });
      return;
    }

    const body = file.build(state);
    // A byte-order mark on the CSV files, because Excel on Windows reads a
    // plain UTF-8 file as the local code page and mangles anything accented.
    const payload = file.contentType.startsWith('text/csv') ? `${CSV_BOM}${body}` : body;

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName(sessionId, file.fileName)}"`,
    );
    // Nothing here should ever come out of a cache: a teacher who plays another
    // year and downloads again must get the new file.
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(payload);
  });
}
