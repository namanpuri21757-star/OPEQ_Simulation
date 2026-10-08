# Changelog

Notable changes, newest first. Dates are the day the work was finished.

This project follows [semantic versioning](https://semver.org): the version
before 1.0.0 was never released to anyone, so the entries below describe how the
app was built rather than how it changed for a user.

## 1.0.0 — 2026-10-07

The first version meant for a real classroom. Everything an instructor needs to
run one lesson, on one laptop, with no internet.

### For the teacher

- **`npm run class`**, and a double-click launcher for macOS and Windows. It
  checks the Node version, that it can save, that the build matches the source
  (rebuilding if not) and that the port is free, then starts on every network the
  laptop is on and prints the join address with a QR code in the terminal. It
  opens the dashboard, explains the firewall question the first time, reminds you
  to turn sleep off, and shuts down cleanly on Ctrl+C with everything saved.
- **A README written for a non-technical teacher**: one-time install, how to
  start, how to run a class, how to stop, where the data is and how to delete it,
  how to update, and a troubleshooting table. Including what to do when the
  school network blocks computers from reaching each other, which is the one
  problem that can stop a lesson.
- **`docs/DRY-RUN.md`**: a tick-box checklist for the day before and for the
  twenty minutes before the bell, plus a one-minute recovery card for a laptop
  that restarts, a group computer that dies and a projector that goes blank.
- **Network check per table.** `/check` now reports as the country whose computer
  it is, and the lobby list shows **OK**, **Slow** or **Not checked yet** on each
  row. The question before a lesson is "which table have I not been round to
  yet", and a single total could not answer it.
- **`docs/READINESS-REPORT.md`**: every acceptance ID with its result, the
  machine it was run on, and an honest statement of the two things only a real
  classroom can prove.
- **Fixed: the one big button's confirmation could do something other than what
  it said.** It read the next step live, so a year closing on its own timer while
  the question was open changed what pressing Yes would do. It now runs the step
  it was opened for, and says plainly when the lesson has moved on instead.

### The game

- Three countries per world, 1 to 6 worlds, 12 scored years by default, a
  practice year that never counts, chat windows, a face-to-face summit, an
  unannounced new producer and a final-year warning. Four presets for 50, 75 and
  90 minute lessons and a five-second-year preset for demos and tests.
- Exact integer arithmetic throughout: tenths of a million barrels, cents,
  thousands of dollars. The same inputs and seed always give the same result.
- Every setting an instructor can change before the game starts, with a live
  preview of what cooperating, competing and cheating pay under those numbers.

### The screens

- Team terminal with rotating roles, a what-if calculator, an optional huddle, a
  world chat with structured pledges, and reflections at the end.
- Instructor dashboard with one big button that always says the next step, a
  lobby, a live grid, alerts that find what needs attention, printable team cards
  and generated classroom materials.
- Projector view that can only ever show what the whole room may see.
- A debrief with five screens, each mirrorable to the projector, a print-friendly
  summary, and six CSV files and one JSON file to download.

### Under it

- The server is authoritative. Every command is validated with zod, permission
  checked, idempotent by `commandId` and rejected if stale.
- Every accepted command is appended and fsynced before anything is broadcast. A
  phase that was running comes back paused after a restart, saying so.
- No screen is ever sent another world's data, another team's private writing, or
  a key it should not have — checked against the real socket frames browsers
  received, not against the view builders.
- 39 numbered acceptance requirements, 37 of them automated and run by
  `npm run verify`: unit, integration and acceptance suites with coverage
  thresholds on the engine, three simulated classes, a 50-connection load test,
  and six Playwright specs in real browsers including an accessibility audit, a
  keyboard-only lesson and the offline guarantee.
- No internet at runtime, and nothing in the dependency tree that compiles or
  ships a native binary for the classroom server.
