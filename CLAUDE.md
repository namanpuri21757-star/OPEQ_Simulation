# Crude Accord - working rules

At the start of every task read docs/SPEC.md (source of truth), docs/PROGRESS.md and docs/DECISIONS.md.

Commands: npm run dev, build, start, class, test, verify, simulate, loadtest, e2e (each added in its phase).

Rules
1. The server is authoritative. Clients never compute results or change phases.
2. Never send raw state to a client. Only viewForTeam, viewForProjector and viewForInstructor.
3. Quantities and money use integer units: tenths of a million barrels, cents, thousands of dollars.
4. Validate every incoming payload with zod, check permissions, enforce commandId idempotency and expectedPhase / expectedYear.
5. Persist (append and fsync) before broadcasting.
6. Every feature needs tests. Never weaken, skip or delete a test to make it pass. If a test shows the spec is wrong, stop and explain.
7. No internet access at runtime and no native-compiled dependencies.
8. Students use this to learn: plain, kind language; never show best responses or other worlds during play.
9. Never use the names OPEQ, Wharton, Harvard, HBP, Alba, Batia or Capita, and never copy proprietary material.
10. Where the spec is silent, choose the simplest option that serves the learning goals and log it in docs/DECISIONS.md.
11. Finish every phase by running npm run verify until it passes, updating docs/PROGRESS.md and committing as Phase N: short summary.
12. Keep files small and readable. Comment the why, not the what.
