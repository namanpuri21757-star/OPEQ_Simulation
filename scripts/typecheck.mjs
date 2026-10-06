import { fail, runSteps } from './run.mjs';

// Three targets, three different lib/module settings, so three passes.
try {
  await runSteps([
    ['Typecheck: server', 'tsc', ['-p', 'tsconfig.server.json', '--noEmit']],
    ['Typecheck: client', 'tsc', ['-p', 'tsconfig.client.json']],
    ['Typecheck: tests', 'tsc', ['-p', 'tsconfig.tests.json']],
  ]);
  console.log('\nTypes are fine.');
} catch (err) {
  fail(err);
}
