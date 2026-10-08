# Readiness report — Crude Accord 1.0.0

**Is this ready to use with a real class? Not yet.**

Everything that can be proved by a machine has been proved, on a clean checkout,
on a dated machine, and every result is in the table below. Two things remain,
and neither of them is a bug: **M1**, a real school network with real group
computers, and **M2**, a pilot with real people. They cannot be automated,
because the two things most likely to stop a lesson are a network nobody
controls and a person meeting the screens for the first time.

**The app is ready for class only after M1 and M2 have been done and passed.**
Both are written out step by step at the end of this report. Each takes under an
hour. Until then, treat this as a finished build that has never met a classroom.

---

## The run

Run from a clean checkout: every tracked file written out fresh with
`git checkout-index`, then `npm ci`, then `npm run verify`. No `dist/`, no
`data/`, no cached `node_modules` carried over from development.

|                      |                                             |
| -------------------- | ------------------------------------------- |
| **Date**             | 2026-10-07                                  |
| **Version**          | 1.0.0 (`package.json`)                      |
| **Commit**           | Phase 8: classroom launch, tagged `v1.0.0`  |
| **Node**             | v22.20.0                                    |
| **npm**              | bundled with that Node                      |
| **Operating system** | Microsoft Windows 11 Home, build 10.0.26300 |
| **Browser**          | Chromium bundled with Playwright 1.63       |
| **Command**          | `npm ci` then `npm run verify`              |
| **Result**           | **Verify passed** (exit code 0)             |
| **Time taken**       | 6.1 minutes, after a 14-second `npm ci`     |

What `npm run verify` runs, in order: typecheck (server, client, tests), lint,
the unit, integration, acceptance and component suites with coverage thresholds,
the generated-materials freshness check, three simulated classes, the build, the
load test, and the Playwright suite in a real browser.

---

## Every acceptance ID

Every row is from [`ACCEPTANCE.md`](ACCEPTANCE.md). "Pass" means the test named
there ran in the verify run above and passed. That run was 753 tests in 66 files
(unit, integration, acceptance and component), the coverage thresholds on the
engine, the generated-materials freshness check, three simulated classes, the
build, the load test, and 7 Playwright specs in Chromium - all green, nothing
skipped, no retries configured.

| ID     | What it proves                                                                | Result       |
| ------ | ----------------------------------------------------------------------------- | ------------ |
| C1     | 9 terminals, the instructor and the projector connect at once                 | Pass         |
| C2     | 9 teams submit in the same instant, 20 times over                             | Pass         |
| C3     | Load: 50 connections through a full game, every terminal reconnecting 3 times | Pass         |
| C4     | Restricted network: a full year with WebSockets disabled, polling only        | Pass         |
| I1     | Privacy: the payload scan over the socket frames real browsers received       | Pass         |
| I2     | Permissions: teams and the projector cannot run instructor commands           | Pass         |
| E1     | Engine vectors V1–V8, BR1–BR2, CM1                                            | Pass         |
| E2     | Engine against an independent reference calculation                           | Pass         |
| E3     | Replay reproducibility                                                        | Pass         |
| E4     | Bounds: variance, capacity, prices and profits stay inside their bands        | Pass         |
| K1     | Pause and resume                                                              | Pass         |
| K2     | +30 s and Close now                                                           | Pass         |
| K3     | A double-click on the big button, and two instructor tabs together            | Pass         |
| K4     | Events fire once, in the right worlds                                         | Pass         |
| D1     | A command the network swallowed, sent again                                   | Pass         |
| D2     | Submit, change and resubmit near the deadline                                 | Pass         |
| D3     | Submit after the year closed                                                  | Pass         |
| R1     | Terminal reloaded mid-year                                                    | Pass         |
| R2     | Terminal offline for 2 minutes                                                | Pass         |
| R3     | A terminal's computer fails                                                   | Pass         |
| R4     | A late team claims in Year 6                                                  | Pass         |
| R5     | A team never claims at all                                                    | Pass         |
| R6     | Server killed mid-year, restarted within 30 s                                 | Pass         |
| R7     | Instructor's browser closed for 5 minutes                                     | Pass         |
| R8     | Projector closed and reopened                                                 | Pass         |
| N1     | A new session from a preset, and yesterday's codes                            | Pass         |
| N2     | Reset                                                                         | Pass         |
| N3     | Two sessions in separate data folders                                         | Pass         |
| F1     | Three simulated classes with different strategy mixes                         | Pass         |
| F2     | A complete lesson in nine browsers, with a reload and a restart               | Pass         |
| A1     | Accessibility: axe on twelve screens                                          | Pass         |
| A2     | Keyboard only: join, play a year, read the result, no mouse                   | Pass         |
| S1     | Oversized payloads                                                            | Pass         |
| S2     | A message containing HTML or a script tag                                     | Pass         |
| S3     | Keys and tokens in server logs                                                | Pass         |
| O1     | Offline guarantee: no screen asks for anything off this server                | Pass         |
| O2     | The launcher's preflight checks                                               | Pass         |
| **M1** | **A real school network with real group computers**                           | **Not done** |
| **M2** | **A usability pilot with real people**                                        | **Not done** |

---

## Not yet verified

These two are the whole reason this report does not say "ready". Do them in this
order: M1 first, because M2 in a room where nobody can connect tells you nothing.

### M1 — a real school network, with real group computers

**What it proves.** That the computers in the room can reach the teacher's
laptop at all. Many school networks deliberately stop computers talking to each
other. Every automated test above runs on one machine talking to itself, so not
one of them can tell you this.

**What you need.** The teaching laptop, the room you will teach in, and at least
three of the computers the groups will really use — the same model, on the same
Wi-Fi, logged in as a student would be. More is better; all nine is best.

**How to do it, in the real room, at the time of day you will teach:**

1. On the laptop, start the app (`npm run class`, or double-click the launcher).
   Say **Allow** / **Private networks** if your computer asks about the network.
2. Write down the address it prints. Note which network card it names.
3. On the first group computer, open that address. **Write down whether the page
   appeared, and how long it took.**
4. Type the join code from a printed card and confirm the country.
5. On the same computer, open `/check` and press **Start the check**. Write down
   the number of milliseconds it reports.
6. On the laptop's dashboard, confirm that country's row says **Connected** and
   its network check says **OK**.
7. Repeat 3–6 on every computer you brought.
8. With all of them connected, open a year and have every computer submit a
   number at the same moment. Confirm every decision lands.
9. Carry one computer to the far corner of the room and run `/check` again from
   there. Write the number down.
10. Leave everything connected and idle for ten minutes, then submit again from
    each. This catches a network that quietly drops idle connections — a real
    failure mode that only shows up on a timescale no test will wait for.

**It passes when:** every computer reached the address, every row said
**Connected**, every network check said **OK** (under 300 ms), every simultaneous
decision landed, and the ten-minute idle test did not lose anyone.

**If it fails**, you have learned the thing worth learning, in time to fix it.
Go to "If the group computers cannot reach you" in [../README.md](../README.md):
try the phone hotspot, and ask IT. Then do M1 again on whichever of those you
chose — a pass on the hotspot is a pass, as long as that is how you will teach.

**Record:** the date, the room, the network (school Wi-Fi or hotspot), how many
computers, the slowest `/check` reading, and anything you had to do to get it
working.

### M2 — a usability pilot with real people

**What it proves.** That a teacher who has never seen it can run the lesson, and
that groups understand their own screen without being told. Every screen in this
app was written by someone who already knew what it did, which is exactly the
wrong person to judge whether it is clear.

**What you need.** One teacher who has not been involved in building this and
has not read the runbook in advance. Six to nine students, in groups of two or
three, of the age you will actually teach. One hour. Someone to watch and write,
who is **not** the teacher.

**How to do it:**

1. Give the teacher only [../README.md](../README.md), [DRY-RUN.md](DRY-RUN.md)
   and the printed materials. Then leave them alone with it.
2. **Do not help.** Every time you want to explain something, write down what you
   wanted to say instead. That list is the result of this exercise.
3. Watch for and time these specifically:
   - How long from "start the app" to "every group connected".
   - Whether the teacher found the network check without being told.
   - Whether any group typed the wrong code, and what they did next.
   - Whether groups understood that the practice year does not count. Ask them
     afterwards; do not assume.
   - Whether the Envoy understood that only they type in the chat window.
   - Whether anyone was confused about what a "million barrels" is, or typed a
     number in the wrong units.
   - Where the teacher hesitated before pressing the big button.
   - Whether any group did not notice their year had closed.
4. Afterwards, ask the teacher three questions and write the answers down:
   - What was the most uncomfortable moment?
   - What would you want to know before doing this with a full class?
   - What would you change about the dashboard?
5. Ask one student from each group: _in your own words, what were you trying to
   do?_ If the answer is not roughly "make our country the most money without
   everyone producing so much the price collapses", the briefing needs work.

**It passes when:** the teacher ran the lesson from start to debrief without
being rescued, every group got connected and submitted in every year, and no
student misunderstood what they were deciding.

**Record:** the date, the teacher's experience level, the ages of the students,
the list of things you wanted to say but did not, and the answers to the three
questions.

---

## Things known and deliberate

Not failures. Written here so nobody has to rediscover them.

- **Chromium is the browser the suite must pass in.** Firefox passes too, and was
  run separately. WebKit passes three of the five specs; the other two cannot be
  judged on this machine, because eleven WebKit contexts at once exhaust it. That
  is the machine, not the app. See the "Other browsers" section of
  [ACCEPTANCE.md](ACCEPTANCE.md).
- **The browser suite opens up to eleven browser contexts at once and asserts on
  stopwatches**, so it needs a laptop that is not busy with something else. It
  deliberately has no retries, because a retry would hide a real slowdown.
  Getting this report took four runs: the first three each failed one spec, and
  chasing those down found two genuine defects rather than flakiness - a
  confirmation dialog that could do something other than what it said, and a
  test helper that pressed a step it had not read. Both are fixed and recorded in
  [DECISIONS.md](DECISIONS.md), and the run above is green with no retries. The
  lesson for next time is to treat a browser-suite failure as real until proved
  otherwise.
- **Coverage thresholds cover the engine and the unit converters, not the whole
  app.** Those two decide every number a student sees. The server and the screens
  are covered by the integration, acceptance, simulation and browser suites
  instead. This is a deliberate choice recorded in
  [DECISIONS.md](DECISIONS.md).
- **No laptop is stopped from sleeping by this program.** It cannot be done
  reliably across operating systems without privileges a classroom app should not
  ask for, so the launcher prints the setting to change instead, and
  [DRY-RUN.md](DRY-RUN.md) makes it a tick box.

---

## What to do with this report

After M1 and M2:

1. Replace "Not done" in the two rows above with the date they were done and a
   one-line result.
2. Update M1 and M2 in [ACCEPTANCE.md](ACCEPTANCE.md) to match.
3. Change the first line of this report.

Before changing that first line, re-read what M1 and M2 actually proved. "It ran
in a room once" is a pass. "It worked on my home Wi-Fi" is not.
