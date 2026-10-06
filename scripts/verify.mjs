import { fail, runSteps } from './run.mjs';

// The gate every phase has to pass. Later phases add simulate, loadtest and e2e.
try {
  await runSteps([
    ['Typecheck', 'npm', ['run', 'typecheck']],
    ['Lint', 'npm', ['run', 'lint']],
    ['Tests', 'npm', ['run', 'test']],
    ['Build', 'npm', ['run', 'build']],
  ]);
  console.log('\nVerify passed.');
} catch (err) {
  fail(err);
}
