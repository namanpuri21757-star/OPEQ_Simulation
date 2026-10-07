import { fail, run } from './run.mjs';

/**
 * npm run e2e - the Playwright suite.
 *
 * It builds first, every time. The end-to-end tests start the built server as a
 * child process and point real browsers at the built client, so running them
 * against a stale dist/ would test yesterday's app and say nothing useful. The
 * build takes a couple of seconds, which is worth paying to never be lied to.
 *
 * Anything after `--` goes to Playwright, so `npm run e2e -- --headed` and
 * `npm run e2e -- tests/e2e/keyboard.spec.ts` both work.
 */
const passThrough = process.argv.slice(2);

try {
  console.log('\n=== Building, so the browsers see the current app ===');
  await run('npm', ['run', 'build']);
  console.log('\n=== Playwright ===');
  await run('npx', ['playwright', 'test', ...passThrough]);
  console.log('\nEnd-to-end suite passed.');
} catch (err) {
  fail(err);
}
