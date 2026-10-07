import { fail, runSteps } from './run.mjs';

/**
 * Acceptance F1: npm run simulate, three times, with three different classes.
 *
 * One mix is not enough. A room full of groups that all cooperate never breaks
 * the cartel, so it never exercises the parts of the engine and the debrief that
 * only appear when somebody cheats; a room full of competitors never produces a
 * pledge to compare against. Three mixes between them cover cooperation,
 * defection, retaliation, late submitting, a flaky laptop and a group that is
 * simply unpredictable - and all three have to pass.
 *
 * The presets differ too, so the schedule, the number of years and the timers
 * are not the same three times over.
 */
const MIXES = [
  {
    label: 'A careful class',
    args: [
      '--worlds=3',
      '--preset=standard-75',
      '--strategies=cooperative,titForTat,lateSubmitter',
    ],
  },
  {
    label: 'A competitive class',
    args: ['--worlds=3', '--preset=short-50', '--strategies=competitive,cheater,titForTat'],
  },
  {
    label: 'A mixed class on a poor network',
    args: [
      '--worlds=4',
      '--preset=test-fast',
      '--strategies=cooperative,competitive,cheater,random,flaky',
    ],
  },
];

try {
  await runSteps(
    MIXES.map((mix) => [
      `${mix.label} (${mix.args.join(' ')})`,
      'npm',
      ['run', 'simulate', '--', ...mix.args],
    ]),
  );
  console.log(`\nAll ${String(MIXES.length)} simulated classes passed.`);
} catch (err) {
  fail(err);
}
