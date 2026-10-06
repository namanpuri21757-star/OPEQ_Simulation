import { spawn } from 'node:child_process';

/**
 * Runs an npm-installed command the same way on Windows, macOS and Linux.
 * `shell: true` lets Windows find the .cmd shims npm writes into node_modules/.bin.
 */
export function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code}).`));
    });
  });
}

/** Runs steps one after another and stops at the first failure. */
export async function runSteps(steps) {
  for (const [label, command, args] of steps) {
    console.log(`\n=== ${label} ===`);
    await run(command, args);
  }
}

/** Prints a friendly message instead of a stack trace when a step fails. */
export function fail(err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
