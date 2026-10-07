# Decisions

Choices made where the spec was silent, newest first, each with date, decision and reason.

## 2026-10-07 - A settings patch carries only the fields that were sent

Decision: `settingsPatchShape` strips the top-level `.default()` off every field before making it optional, and `settingsInputSchema` uses it. Groups such as `timers` keep their inner defaults, because a form sends a group whole.

Reason: `settingsShape.partial()` still produces a default for an absent key, so `createSession { preset: 'test-fast', settings: { worlds: 3 } }` arrived carrying every standard-75 value and overwrote the preset. Choosing a preset and changing one thing silently gave the wrong lesson length, schedule and timers, with nothing on screen to show it. The patch now means what it says.

## 2026-10-07 - The terminal that has just claimed is sent its view immediately

Decision: `afterClaim` calls `sendView` for that socket and then broadcasts to the session.

Reason: the broadcast inside `store.handle` happens before the socket layer knows which team this socket is, so the claiming terminal was sent the almost-empty lobby view and then waited for the next thing to happen. A group that skipped typing its names sends nothing after the claim, so it sat on "Getting your country ready" until the teacher pressed something. The second broadcast is wanted anyway: the connected column has just changed.

## 2026-10-07 - A join link that names a code always offers that code

Decision: `/join/CODE` on a computer that already has a country shows two buttons - go back to our screen, or use this computer for CODE instead - rather than redirecting. A bare `/join` still redirects.

Reason: the redirect made two real things impossible: a teacher moving a computer to a different table, and one browser standing in for three team computers in a solo trial run, since every tab of one browser shares the same saved terminal. Forgetting the old country before claiming keeps it a fresh claim rather than the terminal asking to take itself over.

## 2026-10-07 - A pause that came from a restart is marked in the timer

Decision: `TimerState.restarted` is set only when loading a session whose phase was still running, and `timingView` reports it as `resumedAfterRestart`. Every command that touches the timer builds a fresh `TimerState`, so the flag clears itself.

Reason: SPEC section 9 asks the dashboard to say "Resumed after restart - press Resume". The state after a restart is otherwise identical to a teacher's own pause, and telling the room "your teacher paused it" when nobody did would send the teacher looking for a problem that is not there.

## 2026-10-07 - A network check is OK under 300 ms on a known transport

Decision: `NETWORK_CHECK_PINGS` is 20 and `NETWORK_CHECK_OK_MS` is 300. The dashboard counts a report as OK when the median round trip is at or under 300 ms and the transport is websocket or polling.

Reason: SPEC 8.6 asks for a round-trip measurement and an "OK or a plain explanation" but fixes neither number. 300 ms is the figure SPEC section 9 already sets for acks, so a computer that misses it is the one the performance budget is about. Twenty pings give a median that one slow packet cannot move. A slow computer is reported as slow, never as failed: it still plays.

## 2026-10-07 - The preview is drawn with variance off and a fixed seed

Decision: `settingsPreview` resolves its three rows with `variancePct: 0` and a constant seed.

Reason: the preview exists so a teacher can see whether the settings still hold a dilemma. A number that moved every time the panel redrew would make that impossible to read, and production variance is a surprise inside a year rather than something a teacher plans around. The targets are what the panel is about.

## 2026-10-07 - The instructor computer saves its session id and key, never the projector key

Decision: `localStorage` under `crude-accord.instructor` holds `{ sessionId, instructorKey }`. The projector key is read from the instructor's view instead.

Reason: the instructor key is in the instructor's own link already and this is the one computer it is allowed to be on. The projector key is not needed to reopen the dashboard, and keeping one copy of it, in the view, means there is nothing to fall out of step.

## 2026-10-07 - The dashboard passes expectedPhase and expectedYear explicitly

Decision: every guarded control calls `guardsFor(view)`, and the suggested-action button uses the guards the server put in `suggested`.

Reason: the connection would fill the same two in from the view, so this changes nothing at runtime, but it makes "this control sends the right guards" something a test can check. It also matters for the big button: the server decided that command, that payload and those guards together, so a click made while the game moved on is refused rather than applied to the next year.

## 2026-10-07 - The QR code is drawn as an SVG path from the qrcode grid

Decision: `QrCode` calls `create()` from the `qrcode` package and renders the modules as one `<path>`, rather than injecting the library's finished SVG string.

Reason: the finished SVG would have to go in as raw HTML. Asking only for the black-and-white grid keeps the markup ours, so the code gets a real `role="img"` and label, scales from CSS instead of a baked-in pixel size, and prints black on white on a team card. It is synchronous, so there is no empty square while a promise settles.

## 2026-10-07 - Advanced settings are described as data, and the schedule has its own editor

Decision: `SETTINGS_GROUPS` describes every advanced field as a row with a path, a label, a kind and a hint; `AdvancedSettings` turns one row into one labelled control. The chat-window and summit list gets a small editor of its own, and `timers.perYear` is left to the saved-settings file.

Reason: five groups of hand-written markup drift apart, and each field needs the same three things done right (a real label, the hint, the message tied to it with aria-describedby). A list needs buttons, so the schedule cannot be a row in that table. SPEC 8.4 names the settings a teacher changes and `timers.perYear` is not among them; loading a file still sets it.

## 2026-10-07 - A number box keeps the text as typed, and the preview waits

Decision: the setup form holds the raw text for each numeric field and only moves the draft when that text reads as a number. While any box does not, the preview is replaced by a line saying it will come back.

Reason: "0." has to be typeable on the way to "0.3", and turning it into 0 while someone is typing would be worse than useless. Showing a preview built from the last good value, next to a box the teacher knows is wrong, would be a quietly wrong answer; saying nothing is honest.

## 2026-10-06 - A terminal finds its session over HTTP, with GET /api/sessions

Decision: a read-only endpoint lists the sessions open on this computer - `sessionId`, `createdAt`, `phase` and `anyFree` - and a terminal joins the newest one. No keys, no team ids, no join codes.
Reason: a printed join code names a team, not a session, but `hello` needs a `sessionId` before any command can be sent, so a terminal has a chicken-and-egg problem that no socket command can solve. A classroom server runs one session, so "the newest one here" is always the right answer. The summary carries nothing a student could use for anything else, which is why it is not simply the session state.

## 2026-10-06 - Screens take a view and a send function as props; only the route reads the context

Decision: every panel and screen under `src/client/team` is a plain component with `view`, `send` and an optional `onSaid`. `TeamTerminal` is the only one that calls `useView()`.
Reason: a component test can then render any screen with a `TeamView` built by `tests/support/teamView.ts` and a stub `send`, with no provider, no socket and no fake timers. It also makes the rule in CLAUDE.md 2 visible: a screen can only show what its view carries.

## 2026-10-06 - Charts are hand-drawn SVG, and recharts was removed

Decision: `src/client/ui/LineChart.tsx` draws its own SVG and always renders a `<details>` with the same numbers in a table. `recharts` is no longer a dependency.
Reason: SPEC section 9 already requires a data table behind every chart, and section 9 also forbids telling series apart by colour alone, which a chart library makes awkward (each series here carries a marker shape and a dash pattern as well). The charts are a handful of years, so the library was 400 kB of bundle and a second way of doing layout for no gain.

## 2026-10-06 - The decision box opens on the number the server would fill in

Decision: with nothing submitted, the field starts at last year's target, or at `startingOutput` in the first year, and says in plain words "If you send nothing, your country produces 40.0 million barrels."
Reason: SPEC section 4 fills a missing decision with exactly that number, so the box is not a nudge: it is what will happen anyway, written down. An empty box with a timer running is the one thing a group cannot act on, and a group that wants a different number has to type it either way.

## 2026-10-06 - A terminal whose saved session is gone looks for the game again

Decision: when `hello` is refused the connection clears the saved terminal and the screen offers one button, "Look for the game again", which repeats the `/api/sessions` lookup.
Reason: a terminal remembers its session in localStorage, so the first computer to open the app after the teacher restarts the server presents yesterday's session id and every command afterwards fails with no explanation on screen. The same button covers a deleted session and a laptop that was asleep since another lesson.

## 2026-10-06 - The client retries by itself when the server hangs up

Decision: on a disconnect where Socket.IO will not retry on its own (the other end closed the socket), the connection reconnects after one second.
Reason: Socket.IO treats a server-initiated close as deliberate and stays down. For a classroom that is the wrong default: the common cause is the instructor's computer restarting, and SPEC section 9 says terminals rejoin automatically. The outbox means a decision sent during the gap is delivered with its original commandId once hello succeeds.

## 2026-10-06 - The What-if calculator knows nothing about the new producer

Decision: it works from the group's own number plus its guess of the other two, and never adds the new producer's barrels.
Reason: SPEC section 4 says the new producer arrives unannounced. A calculator that quietly included those barrels would tell a group both that it had arrived and how big it is, which is the one thing the event exists to hide.

## 2026-10-06 - The quick check turns its answers, and every number in it comes from the settings

Decision: `questionsFor(settings)` builds the three questions with the engine, drops a wrong answer that reads the same as the right one, and rotates each question's choices by a different amount.
Reason: SPEC 8.3 says all numbers come from the session's settings, so a teacher who changes the price line cannot be left with a wrong quiz. Rotating stops the right answer always being the first button, which is what a class learns in about ninety seconds.

## 2026-10-06 - Everything a command cannot work out for itself travels in the event

Decision: each saved event carries an `issued` object with the values the server generated when the command arrived: the session id, the seed, the keys, fresh join codes, a terminal token, ids for messages and news, and how long a terminal had been offline. The reducer reads those instead of calling `crypto` or a clock.
Reason: SPEC section 9 requires that replaying `events.jsonl` gives the identical state. A reducer that generated its own ids would produce different ones on every replay, and `claimTeam` would decide differently because nobody is connected during a replay. Putting the facts in the event makes `applyEvent(state, event)` a pure function, which is also what makes a candidate state safe to throw away when the append to disk fails.

## 2026-10-06 - A rejected command may still change state, and is then saved

Decision: `applyEvent` can return `{ ok: false, code, message, state }`. The store persists and broadcasts that state and then sends the failure ack.
Reason: asking to take over a terminal that is still connected has to answer NEEDS_APPROVAL to the asking terminal and at the same time record the request for the instructor. Those are one command, so they have to be one event; splitting them would let a crash lose the request while the terminal thinks it is waiting.

## 2026-10-06 - Who is connected is never saved to disk

Decision: connected state and last-seen times live in the socket layer, not in `SessionState`. The instructor view gets them passed in.
Reason: after a restart nobody is connected, so a saved value would always be wrong and would have to be cleared on load anyway. Keeping it out of the state also keeps `events.jsonl` to real classroom events rather than a stream of network noise, and keeps replay exact.

## 2026-10-06 - createSession is a socket command sent after a "setup" hello

Decision: a brand new instructor screen says `hello { role: 'setup' }` with no session and may then send exactly one command, `createSession`. There is no HTTP endpoint for it.
Reason: SPEC section 9 says Socket.IO carries all live traffic. One path for every command means one place that validates, checks permissions and enforces commandId idempotency, instead of a second half-path over HTTP that would have to repeat all three.

## 2026-10-06 - endGame drops any year that is still open

Decision: `endGame` works from any phase. A year that was open is cleared and never scored.
Reason: SPEC 8.4 lists "end game" as a control the instructor can reach at any time, usually because the lesson has run out of time. Settling a half-finished year would score decisions that groups had not finished making, and refusing the command would leave a teacher stuck with a bell ringing.

## 2026-10-06 - resetSession keeps the teams, their codes and their claims

Decision: a reset clears decisions, outcomes, messages, huddles, predictions, reflections, news and the schedule progress, and goes back to LOBBY. Teams keep their join codes, their member names and their claimed terminals.
Reason: the reason to reset is to play again with the same class. Reissuing codes would mean reprinting cards and reclaiming nine terminals mid-lesson. Deleting a session is the command for starting over completely.

## 2026-10-06 - fireEvent schedules the event for the next year by rewriting the settings

Decision: `fireEvent` sets `newProducer.enabled` and `year`, or `demandEvent.enabled` and `year`, to the year after the current one, and is refused if that event has already taken effect.
Reason: the engine already reads both events out of the settings by year, so moving the year is the whole change; a second mechanism would be a second place for the two to disagree. "Between years only" then falls out of the phase table, and the next `openYear` applies and announces it exactly as a scheduled event would.

## 2026-10-06 - announceFinalYear only when the next year really is the last

Decision: the command is refused unless the current year plus one equals the number of years, and also when `finalYearWarning` is off.
Reason: SPEC section 4 makes the warning a specific moment with a specific effect on behaviour (LG6). An announcement made two years early would be untrue, and the debrief question about what happened after the warning would have nothing to point at.

## 2026-10-06 - The leaderboard names worlds by number and countries by letter, never by id

Decision: leaderboard rows carry `worldNumber`, `letter`, `countryName` and `label` only.
Reason: teams see the leaderboard once results are released, and SPEC section 7 says a team never sees another world's data. A world id or a team id is exactly the kind of handle a curious student could use to ask the server for something else, and the numbers on screen read better anyway.

## 2026-10-06 - The word filter matches on word boundaries read from the original text

Decision: a blocked word must start and end on a boundary in the text as typed, not in the letters-only copy used for matching. Punctuation inside a word is ignored.
Reason: stripping the punctuation first loses every boundary, so "class" would be masked at its "ass". Reading the boundaries off the original keeps innocent words intact and still catches a word spelled out with dots between its letters. The price is that a word split across a space is caught too, which is the right way round for a classroom.

## 2026-10-06 - A name that is masked end to end becomes the numbered default

Decision: `cleanMemberName` falls back to "Member 2" when nothing but asterisks and punctuation is left.
Reason: SPEC section 5 already gives numbered defaults. A row of asterisks on the dashboard and the projector would single the group out, which is the opposite of what the filter is for.

## 2026-10-06 - The burst limit is 120 commands per socket per 10 seconds

Decision: a socket that sends more than that gets RATE_LIMITED. The chat limit of one message per three seconds per team is separate and lives in the state.
Reason: SPEC section 6 fixes the chat limit; the burst limit only exists to stop one stuck screen flooding the server, so it has to sit well above anything a group could do by hand. A team changing its mind twenty times in a minute, plus huddles and predictions, is nowhere near 120.

## 2026-10-06 - Views are sent at most ten times a second, with the first one immediate

Decision: each socket gets a view straight away if it has had a quiet 100 ms, and otherwise one trailing view 100 ms later.
Reason: SPEC section 9 caps the rate. Sending the first one immediately keeps a single click feeling instant, while nine terminals submitting at once still collapse into one message each rather than nine.

## 2026-10-06 - The instructor view carries every year's huddles and predictions

Decision: each team row has `huddles` and `predictions` keyed by year, plus `huddleRecorded` and `predictionRecorded` for the current year.
Reason: the live grid only needs to know whether this year's are in, but SPEC 8.4's debrief compares huddle suggestions and predictions with what each country actually did, year by year. Keeping only the current year would make that screen impossible.

## 2026-10-06 - The last 5000 command results are remembered for idempotency

Decision: `SessionState.results` maps commandId to the ack it produced, oldest dropped past 5000.
Reason: a repeat has to give the same answer, and the memory has to survive a restart, so it belongs in the state and the snapshot. A whole game is well under 5000 commands, so in practice nothing is ever dropped; the cap only stops a very long-running session growing without limit.

## 2026-10-06 - docs/STATE-MACHINE.md is generated, and a unit test keeps it honest

Decision: `npm run docs` writes it from the transition table, and `tests/unit/state-machine.test.ts` fails if the file and the code disagree.
Reason: the brief asks for the table in the code and in the documentation. Two hand-written copies drift the first time a transition changes; generating one from the other makes drift impossible to commit.

## 2026-10-06 - The number in a preset name is the class length in minutes, not a capacity

Decision: `standard-75`, `short-50` and `long-90` all keep capacity 75. The number is roughly how many minutes of class time the preset fills.
Reason: SPEC section 4 lists exactly what each preset changes (years, timers, schedule, new-producer year) and never mentions capacity. Changing capacity would move every number in SPEC section 3, and the vectors V1-V8 are written for capacity 75. Adding up each preset's timers plus its activities lands near its number, so that reading also fits.

## 2026-10-06 - Practice is year 0 everywhere

Decision: the practice year is year 0 in the engine, in variance seeds and in per-year timer overrides. Scheduled events (the new producer, a demand event) are only ever set for year 1 or later, so neither can appear in practice.
Reason: SPEC section 4 says practice is "identical to a normal year" but excluded from scores, and the variance seed in section 3 takes a year. One number for the year keeps the seed, the timer lookup and the exports uniform, and a year that sorts before Year 1 matches what a student sees.

## 2026-10-06 - a, b, cost, capacity and startingOutput are decimals in settings and whole units in the engine

Decision: `Settings` holds the numbers a teacher types (70, 0.3, 1, 75, 40). `economicUnits(settings)` converts them once into cents, hundredths and tenths, and the engine only ever sees whole units.
Reason: CLAUDE.md rule 3 is about the numbers the game computes with, and the engine honours it. A setup form that stored `aCents` would make the instructor screen and the saved-settings JSON hard to read, and the validation SPEC asks for ("at most 2 decimals") only makes sense on the typed value.

## 2026-10-06 - Production variance is drawn in whole basis points and held inside its band

Decision: the draw is a whole number of basis points in [-100v, +100v], the shifted output is `round(target * (10000 + draw) / 10000)`, and the result is then clamped to `[ceil(target * (1 - v)), floor(target * (1 + v))]` before the `[0, capacity]` clamp.
Reason: SPEC section 3 requires actual output within +/-v, rounded to 0.1. Rounding alone can break the band for small targets: 1.0 million with 5% variance would round 1.05 up to 1.1, which is 10% away. The extra clamp keeps the promise, and basis points keep the draw free of floating point.

## 2026-10-06 - Floating point is allowed only in bestResponse, competitiveOutcome and cooperativeMax

Decision: those three divide by 2b or 4b in plain dollars, then round the answer to the nearest tenth of a million. Price and profit for the rounded answer come from the integer functions.
Reason: 1/b is not a whole number of any unit, so the division cannot be exact. Rounding to a tenth means the printed benchmark is a number a team could actually produce, and computing its price and profit with the integer path keeps the answer key equal to what the server would score. These are debrief numbers only, so a half-tenth of rounding changes nothing a student is graded on.

## 2026-10-06 - demandEvent has an `announced` flag, default on

Decision: `demandEvent.announced` defaults to `true`.
Reason: SPEC section 4 says a demand event is announced in the news, so the default matches the spec. The flag exists so `explainChange` has something to check: the rule "mention the demand event only if it was announced" needs a case where it was not.

## 2026-10-06 - The reveal sentence may quote the change in world supply, but never names an unannounced event

Decision: under `full` and `totalOnly` the sentence may say how much world supply moved, including the new producer's barrels. Under `priceOnly` it gives no reason at all. The new producer and a demand event are named only when announced.
Reason: SPEC section 4 already shows the new producer's output as "Other suppliers" under full disclosure and section 7 makes the world total public under `totalOnly`, so the number gives nothing away. Under `priceOnly` the world total is private, so a reason would leak it. Naming the cause is what has to stay secret, not the arithmetic.

## 2026-10-06 - Teacher materials are generated, and verify checks they are fresh

Decision: `npm run benchmarks` writes `docs/materials/answer-key.md`, `docs/ECONOMICS.md` and `docs/materials/engine-check.csv` from the engine and prints the answer key. `npm run benchmarks -- --check` regenerates them in memory and fails if a file on disk differs; `npm run verify` runs it. All three are listed in `.prettierignore`.
Reason: a hand-typed answer key goes stale the first time the economics change. Prettier would realign the generated tables, which would then never match what the generator produces, so it has to leave them alone.

## 2026-10-06 - engine-check.csv has a header row and nothing else

Decision: row 1 is `QA,QB,QC,Price,ProfitA,ProfitB,ProfitC` and row 2 is the first case, with no "generated" banner in the file.
Reason: SPEC asks a teacher to check the file with `=MAX(0,70-0.3*(A2+B2+C2))`. Any extra line at the top would shift every row and break that formula. The generated note lives in `docs/materials/answer-key.md` instead.

## 2026-10-06 - Coverage thresholds cover the engine and units, not the whole app

Decision: `vitest.config.ts` sets a 95% line threshold on `src/shared/engine/**` and `src/shared/units.ts`, enforced by `npm run coverage` inside `npm run verify`.
Reason: those two decide every number a student sees, so a gap there is a wrong result in class. The server and the screens are covered by the integration, simulation and end-to-end suites that later phases add; a global threshold now would only force shallow tests.

## 2026-10-06 - docs/SPEC.md and CLAUDE.md are excluded from Prettier

Decision: both files are listed in `.prettierignore`.
Reason: they are reproduced word for word from the brief. Prettier rewrites Markdown (blank lines after headings, reflowed lists), which would change the text that is meant to stay exact.

## 2026-10-06 - "No native modules" is read as "nothing compiles, and nothing native at runtime"

Decision: the runtime dependency tree must contain no native binaries at all, and `npm install` must never compile anything. Build-time tools may ship prebuilt platform binaries.
Reason: a runtime-only install (`npm ci --omit=dev`) was checked and contains zero `.node` files and zero `binding.gyp` files, so the classroom server is pure JavaScript. The only native files in the full install are Vite 8's prebuilt `rolldown` and `lightningcss` binaries, which run during `npm run build` and never in class. No TypeScript toolchain avoids a prebuilt binary (Vite 7 and tsx both ship esbuild), and prebuilt means no node-gyp, no compiler and no install failures on a school laptop.

## 2026-10-06 - shell-quote pinned with an npm override

Decision: `overrides: { "shell-quote": "^1.12.0" }` in package.json.
Reason: `concurrently` (a dev-only tool) depends on a `shell-quote` range with open advisories. Every published `concurrently` version does, so the override is the only way to reach `npm audit` clean without dropping the tool.

## 2026-10-06 - Vitest with two projects (node and jsdom)

Decision: one Vitest config with a `node` project for `tests/unit` and `tests/integration`, and a `jsdom` project for client component tests under `src/client`.
Reason: the spec asks for unit, integration and component coverage in one package. Separate projects keep server tests fast and give React tests a DOM without a second tool.

## 2026-10-06 - Server compiled with tsc to dist/server, client bundled by Vite

Decision: `tsconfig.server.json` runs `tsc` over `src/server` and `src/shared` into `dist/server`; Vite builds `src/client` into `dist/client`.
Reason: the spec names both outputs. Plain `tsc` avoids adding a server bundler, and keeps `node dist/server/index.js` as the start command with no runtime loader.

## 2026-10-06 - The @shared alias is declared in three places

Decision: `@shared/*` maps to `src/shared/*` in `tsconfig.base.json` (for the editor and `tsc`), in `vite.config.ts` `resolve.alias` (for the client bundle) and in `vitest.config.ts` (for tests).
Reason: each tool resolves paths on its own. Declaring the same mapping in each config is simpler than adding a path-rewriting build step.

## 2026-10-06 - Server source imports shared code by relative path

Decision: files under `src/server` import shared code as `../shared/...`; the `@shared` alias is for client and test code only.
Reason: `tsc` does not rewrite path aliases in its output, so aliased imports would break at runtime in `dist/server`. Relative imports need no loader, which keeps rule 7 (no extra runtime tooling) intact.

## 2026-10-06 - Cross-platform scripts live in scripts/*.mjs

Decision: anything beyond a single command (port probing, launch, multi-step verify) is a small Node script in `scripts/`, run as `node scripts/<name>.mjs`.
Reason: the spec requires Windows, macOS and Linux support, so no shell-only syntax (`&&` chains inside one script string, `rm -rf`, env prefixes) may appear in package.json scripts.

## 2026-10-06 - ESLint flat config, Prettier for formatting only

Decision: `eslint.config.js` (flat) with typescript-eslint recommended rules plus react-hooks; Prettier handles formatting and is not wired into ESLint.
Reason: flat config is the supported format in current ESLint. Keeping the two tools separate avoids slow type-aware formatting rules and keeps `npm run lint` fast enough to run in `verify`.

## 2026-10-06 - Health endpoint shape

Decision: `GET /api/health` returns `{ "ok": true, "name": "crude-accord", "version": "<package version>" }`.
Reason: the spec says "returning ok, name and version" but not the shape. A flat JSON object is the simplest thing both the integration test and the `/check` page can read.
