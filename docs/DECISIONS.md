# Decisions

Choices made where the spec was silent, newest first, each with date, decision and reason.

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
