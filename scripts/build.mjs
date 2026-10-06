import { fail, runSteps } from './run.mjs';

// Vite writes dist/client; tsc writes dist/server and dist/shared.
try {
  await runSteps([
    ['Building the client (Vite)', 'vite', ['build']],
    ['Compiling the server (tsc)', 'tsc', ['-p', 'tsconfig.server.json']],
  ]);
  console.log('\nBuild finished. Start it with: npm start');
} catch (err) {
  fail(err);
}
