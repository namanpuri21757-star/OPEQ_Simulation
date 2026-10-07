import { fail, runSteps } from './run.mjs';

/**
 * npm run verify:quick - everything except the load test and the browsers.
 *
 * For use while writing code: it is the same gate as npm run verify minus the
 * two steps that take minutes rather than seconds. It is not a substitute for
 * the real one, and nothing is "done" until `npm run verify` passes.
 */
try {
  await runSteps([
    ['Typecheck', 'npm', ['run', 'typecheck']],
    ['Lint', 'npm', ['run', 'lint']],
    ['Tests and coverage', 'npm', ['run', 'coverage']],
    ['Generated materials are fresh', 'npm', ['run', 'benchmarks', '--', '--check']],
    ['Three simulated classes', 'npm', ['run', 'simulate:all']],
    ['Build', 'npm', ['run', 'build']],
  ]);
  console.log('\nVerify (quick) passed. Run npm run verify before calling anything done.');
} catch (err) {
  fail(err);
}
