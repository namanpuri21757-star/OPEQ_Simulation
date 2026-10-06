import { fail, runSteps } from './run.mjs';

// Phase 1 version: build, then start. The full classroom launcher (network
// addresses, instructor link, QR code, opening the browser) arrives later.
try {
  await runSteps([
    ['Build', 'npm', ['run', 'build']],
    ['Start', 'npm', ['start']],
  ]);
} catch (err) {
  fail(err);
}
