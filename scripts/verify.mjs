import { fail, runSteps } from './run.mjs';

// The gate every phase has to pass. Later phases add simulate, loadtest and e2e.
//
// Coverage stands in for the plain test run: it runs the same suites and then
// enforces the line thresholds on the engine and the unit converters. The
// benchmarks check fails if the generated teacher materials no longer match the
// engine, so the economics can never change without the answer key following.
try {
  await runSteps([
    ['Typecheck', 'npm', ['run', 'typecheck']],
    ['Lint', 'npm', ['run', 'lint']],
    ['Tests and coverage', 'npm', ['run', 'coverage']],
    ['Generated materials are fresh', 'npm', ['run', 'benchmarks', '--', '--check']],
    ['Build', 'npm', ['run', 'build']],
  ]);
  console.log('\nVerify passed.');
} catch (err) {
  fail(err);
}
