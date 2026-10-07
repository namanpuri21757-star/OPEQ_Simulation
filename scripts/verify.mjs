import { fail, runSteps } from './run.mjs';

/**
 * The gate every phase has to pass.
 *
 * Coverage stands in for the plain test run: it runs the same suites (unit,
 * integration, acceptance and the component tests) and then enforces the line
 * thresholds on the engine and the unit converters. The benchmarks check fails
 * if the generated teacher materials no longer match the engine, so the
 * economics can never change without the answer key following.
 *
 * The three simulated classes, the load test and the end-to-end suite are the
 * slow ones and come last, so a mistake in the fast checks is reported in a
 * minute rather than in ten. `npm run verify:quick` leaves out the two slowest.
 */
try {
  await runSteps([
    ['Typecheck', 'npm', ['run', 'typecheck']],
    ['Lint', 'npm', ['run', 'lint']],
    ['Tests and coverage', 'npm', ['run', 'coverage']],
    ['Generated materials are fresh', 'npm', ['run', 'benchmarks', '--', '--check']],
    ['Three simulated classes', 'npm', ['run', 'simulate:all']],
    ['Build', 'npm', ['run', 'build']],
    ['Load test', 'npm', ['run', 'loadtest']],
    ['End to end', 'npm', ['run', 'e2e']],
  ]);
  console.log('\nVerify passed.');
} catch (err) {
  fail(err);
}
