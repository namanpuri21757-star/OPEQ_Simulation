# Changelog

Notable changes, newest first. Dates are the day the work was finished.

This project follows [semantic versioning](https://semver.org): the version
before 1.0.0 was never released to anyone, so the entries below describe how the
app was built rather than how it changed for a user.

## 2.0.0 — 2026-10-08

The clarity release. Nine features were removed and every screen was redesigned
around one rule, now written into `docs/SPEC.md` as section 8.0:

> Every element on a screen must answer a question the user has at that moment.
> If it does not, it is not on the screen.

The game is unchanged. The price rule, the costs, the timers, the number of
years, the practice year, auto-fill, the disclosure modes, the unannounced new
producer, the final-year warning, the summit, persistence and reconnection all
behave exactly as they did in 1.0.0.

### Removed

From the team terminal: the briefing quick check; the Huddle panel; the
waiting-time predictions and trust rating, and the debrief charts and exports
built on them; the What-if calculator; the News panel and every news banner; the
"Promised" and "Promise kept?" columns and the structured pledge behind them;
and the Analyst role.

From the teacher's screens: the Announcement button, and the Change demand
button with the demand-event setting.

Each removal took its tests with it, as an authorised spec change. What it
dragged out with it - the chat mode setting, the decision box's steppers and
slider, the v1 dark theme, the dashboard's "Things to look at" list - is listed
in the Changelog at the end of `docs/SPEC.md` and argued in
`docs/DECISIONS.md`.

### Added

- **One messaging switch.** Held per world, off by default, with its own command
  (`setMessaging`) and its own test file. Turning it on asks how long and which
  worlds; it turns itself off when the time runs out; the plan's scheduled
  windows arrive as the suggested next step and leave exactly the same state as
  the switch does.
- **`src/client/theme.css`.** Every colour, space, rule weight, font stack and
  type size in one file. Six colours, one light theme, a visible grid of 1px
  rules, and monospace tabular figures for every number on every screen.
- **Two teacher screens instead of one.** A start screen of five numbered steps
  before the lesson, a live screen during it, and the lesson settings on a page
  of their own.
- **`docs/screenshots/v2/`**, filled by `tests/e2e/screenshots.spec.ts`: every
  main screen at 1280x800, and the projector at 1920x1080.

### Changed

- Exports are four CSV files plus the JSON, not six plus the JSON.
- `messages.csv` is World, Year, Letter, Country, Text and Sent at.
- Debrief question 9 asks how a group agreed on its number rather than whose
  huddle suggestion won, because the huddle table that answered it is gone.
- A session saved by 1.0.0 still opens: everything removed is dropped on the way
  in, and an event-log line for a command that no longer exists is skipped
  without a warning (`tests/integration/v1-sessions.test.ts`).

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
