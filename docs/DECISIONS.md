# Decisions

Choices made where the spec was silent, newest first, each with date, decision and reason.

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
