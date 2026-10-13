# Crude Accord - Specification v2.0

## 0. About this project
Crude Accord is an original classroom simulation of an oil producers' cartel. Groups of students each run one country's Oil Production Board. Three countries share one world market. Every simulated year, each group decides how many million barrels to produce. The world price falls as total production rises. Each group tries to maximize its own country's cumulative profit. The game teaches cooperation and competition, negotiation, trust, and basic oligopoly game theory.
It is inspired by the publicly described structure of a well-known business-school negotiation simulation. It must not use that product's name, its school's or publisher's names or branding, its country names, its screen designs, or any of its text. Everything here is original.
Typical use: one instructor and 25 students in 9 groups across 3 worlds. Students may be teenagers, so all text must be plain, kind and age-appropriate.

## 1. Learning goals (every feature must serve at least one)
LG1 Feel the tension between self-interest and the group's total profit (a social dilemma like the prisoner's dilemma).
LG2 Practice negotiation and communication: making, keeping and breaking promises; credibility.
LG3 See how trust is built, broken and sometimes repaired, and how early moves set the tone.
LG4 Understand oligopoly: best response, the competitive (Nash) outcome and the cooperative (cartel) outcome.
LG5 Observe how price and profit move with total supply.
LG6 Notice how transparency, a surprise new producer and a known final year change behavior.

## 2. Classroom setup
- The instructor computer runs the server and shows the Instructor Dashboard.
- A Projector View (a browser tab, usually on a second screen) shows public information only.
- Each group has exactly ONE computer, its Team Terminal. All input for that country is typed there.
- A session has 1 to 6 worlds (default 3). Each world has exactly 3 countries, labeled A, B and C.
- Country names, the same in every world: A = Ardonia, B = Borvia, C = Cendra. A team's label is world plus country, for example World 2 - Borvia (B).
- Recommended for 25 students: 3 worlds x 3 groups = 9 groups of 2 or 3 students.
- Team terminals reach the instructor computer over the local network (school Wi-Fi or a hotspot). No internet is needed during class.

## 3. Economics (defaults; all can be changed by the instructor before the game starts)
Units: production Q in millions of barrels; price P in dollars per barrel; profit in millions of dollars.
- Each year each country chooses a target Q with 0 <= Q <= capacity. Default capacity 75. One decimal place allowed (for example 50.3).
- World price: P = max(0, a - b * (Qa + Qb + Qc + Qn)) with defaults a = 70 and b = 0.3, so P = 70 - 0.3 * (Qa + Qb + Qc + Qn). Qn is the new producer's output, 0 until it enters.
- Profit for country i: profit_i = (P - c) * Q_i, where c is the cost per barrel, default 1 dollar. Profit can be negative only if P < c.
- Cumulative profit is the sum over scored years. The practice year never counts.
- Production variance, default 0 (off). If v > 0: actual_i = target_i * (1 + u) with u uniform in [-v, +v], rounded to 0.1 and clamped to [0, capacity]. Profit uses actual output. Randomness comes ONLY from a seeded generator, seed = hash(sessionSeed, worldId, year, letter). The same inputs and seed must always give the same result.
- Exact arithmetic: store quantities as integer tenths (38.3 is 383). Price in integer cents: priceCents = max(0, round(100*a - 10*b*totalTenths)). Profit in integer thousands of dollars: profitK = (priceCents - costCents) * tenths (1 cent x 0.1 million barrels = 1,000 dollars). Display price like $34.00 and profit in millions with 2 decimals, like $1,320.00M.
- Best response, for the teacher answer key and debrief only, never shown to students during play: q* = clamp((a - c - b*others) / (2b), 0, capacity).
- Cooperative maximum for one year (debrief benchmark): Q* = clamp((a - c - b*Qn) / (2b), 0, 3*capacity); jointMax = (max(0, a - b*(Q* + Qn)) - c) * Q*. Round to 0.01 million.
- Required test vectors with default settings:
  V1 all three at 40: P $34.00; each profit $1,320.00M
  V2 all at 57.5 (competitive outcome): P $18.25; each $991.875M (991875 K)
  V3 75 / 38.3 / 38.3: P $24.52; the 75 country $1,764.00M; the others $900.816M each
  V4 all at 75: P $2.50; each $112.50M
  V5 all at 0: P $70.00; each $0
  V6 all at 38.3 (near the cooperative optimum 38.33): P $35.53; each $1,322.499M
  V7 new producer 15 and all at 38.3: P $31.03; each $1,150.149M
  V8 new producer 100 and all at 75 (test only): P floored at $0.00; each -$75.00M
  BR1 others' total 76.6: best response 76.7, capped to 75
  BR2 others' total 115: best response 57.5
  CM1 cooperative maximum with no new producer: total 115, jointMax $3,967.50M

## 4. Game flow
Phases: LOBBY, BRIEFING, PRACTICE (open, then reveal), YEAR n (open, then reveal), optional between-years activity, ... final year, ENDED, DEBRIEF.
- Default 12 scored years. Students never see the total; they only see Year 5 and so on.
- Default timers: practice 120 s, Years 1-3 150 s, later years 120 s. Pausing keeps the remaining time.
- A year closes when its timer reaches 0 or the instructor clicks Close year. Optional setting autoClose (default off): close as soon as every country in every world has submitted.
- Submitting: the terminal enters Q, clicks Submit and sees an in-app confirmation (Submit 38.3 million barrels for Year 5?). After submitting, the group can change its decision until the year closes. The last submission before closing counts.
- Missing decision at close: the country repeats its previous year's target; in Year 1 and the practice year it uses the starting output (default 40). Auto-filled decisions are marked auto everywhere.
- After closing, the server computes every world at once and then shows the reveal.
- Default between-years schedule: messaging window after Year 3 (4 min); face-to-face summit after Year 7 (5 min); messaging window after Year 10 (3 min). The instructor can add or skip an activity live. A messaging window is not a phase: it is a suggested next step that turns the messaging switch on (section 6). A summit is a phase, because the room moves.
- Default event: a new producer enters at the start of Year 9 producing 15 million barrels a year, unannounced. Under full disclosure its output appears as Other suppliers; teams are not told when it entered.
- Final-year warning (default on): before the last year opens, the instructor is prompted to announce This is the final year. It can be turned off to keep the end secret.
- Disclosure mode (default full): full = everyone in a world sees each country's actual output; totalOnly = world total and price only; priceOnly = price only. A team always sees its own output and profit.
- Practice year: identical to a normal year, labeled PRACTICE everywhere, and excluded from all scores and debrief totals.
- Presets: standard-75 (the defaults above); short-50 (8 years, 90 s years, messaging after Year 3, new producer in Year 6, no summit); long-90 (16 years, messaging after Years 3 and 12, summit after Year 7, new producer in Year 11); test-fast (all timers 5 s, for automated tests and demos).

## 5. Roles on the shared Team Terminal
- When a terminal claims its team, the group may type its members' first names (1 to 4; optional; default Member 1, Member 2, ...). No other personal data.
- The terminal shows two rotating roles, rotating every 4 years (configurable): Operator sits at the keyboard and enters the decision; Envoy writes messages and goes to summits. With 1 member one person does both; with 2 it is one each; with 3 or 4 everyone after the Operator is an Envoy. The terminal shows one line: "At the keyboard: Jack - Envoy: Jared".

## 6. Communication
- Messages go to a world channel shared only by that world's 3 countries. Messages show the country name, never student names. A message is plain text; there is no structured pledge and no announcement.
- Messaging switch: one control, held per world, off by default. Turning it on names how long (2, 3, 4 or 5 minutes, or "until I turn it off") and which worlds (all by default). A window closes by itself when its time runs out, checked by the 1-second tick in every phase. Nothing else ever opens or closes it: no phase, no setting, no schedule.
- Limits: 280 characters; 1 message per 3 seconds per team; a built-in word filter masks offensive words; the instructor can mute a team.
- Summit: terminals show Envoys: go to the meeting point, with a timer. A summit does not turn messaging on; the teacher does, if they want to.

## 7. Who sees what (enforced on the server)
- Team Terminal: only its own world, never another world's data, never another team's reflections. Under totalOnly no per-country outputs of other countries; under priceOnly no world total either.
- Projector: phase, year, timer, whether messaging is on and how long is left, and after each reveal optionally each world's price and results table (projectorShowsPrices, default on). Never a message, never team-private data, never controls. In LOBBY it shows the join QR code and URL.
- Instructor: everything, live.
- Other worlds and the leaderboard become visible to teams only after the instructor clicks Reveal results to teams at the end.
- Implementation rule: the server builds a separate view for each recipient (viewForTeam, viewForProjector, viewForInstructor). Raw session state is never sent to any client.

## 8. Screens
8.0 The clarity rule, which outranks everything else in this section: every element on a screen must answer a question the user has at that moment. If it does not, it is not on the screen. Three things follow. One primary action per screen, a solid ink button with an arrow; everything else is outlined. An action that cannot be used right now is not drawn at all, rather than drawn greyed out. Units are always written next to the number ("million barrels", "$ per barrel", "$M"), the same words are used on every screen (year, produce, price, profit), and no paragraph runs longer than two lines.
8.1 Landing (/): two large buttons, This is a team computer and I am the instructor, plus the app name and a one-line description.
8.2 Join (/join and /join/:code): type or scan a 6-character team join code (no look-alike characters such as 0, O, 1, I, L). Show You are World 2 - Borvia (B). Is that right? before confirming, then ask for member names.
8.3 Team Terminal (/team):
- Status strip: country badge and name, World N, YEAR 5 or PRACTICE, STATUS (Decide / Waiting / Results), TIME LEFT in large monospace, YOUR TOTAL PROFIT, connection dot. Under it one small line: "At the keyboard: Jack - Envoy: Jared".
- Main area: on wide screens the left column holds the decision and the right column holds messages; on narrow screens they stack.
- Decision box: "Year 5 - how many million barrels will Ardonia produce?", a number input (0 to capacity, one decimal) and a primary Submit with a confirmation step. After submitting it reads "Submitted: 38.3 million barrels. You can change this until the timer ends." with a Change button, then one line: "2 of 3 countries in your world have submitted."
- Last year, as one headline observation: the price in bold with its period and its units, the change from the year before under it with an arrow, then two small facts (world production in million barrels, your profit in $M).
- Results table, one row per year, newest at the top: Year | Ardonia (you) | Borvia | Cendra | Other suppliers (only once they exist and disclosure allows) | World total | Price | Your profit. The disclosure mode is followed exactly. Right-aligned tabular figures and a small "auto" mark.
- One chart: price by year, with labelled axes and a source line, and the practice year excluded.
- Messages box: its first line always states its status. Off: "Messaging is off. Your teacher turns it on." On: "Messaging is on: 3:12 left. Jared (Envoy) types for your country." The input exists only while messaging is on.
- Briefing: 4 short screens in sync with the instructor, in large readable type, plus "Your teacher moves these screens on": the story; how price works with one fixed worked example from this session's settings; the two roles; how a year works. Nothing on them is interactive.
- Reveal: the price as the headline number with its change, one plain sentence explaining it (Price fell $4.50 because world supply rose 15.0 million barrels.), then what you produced, your profit this year and your total so far, then this year's world table (Country | Produced | Profit if disclosed). No promise columns.
- Summit screen: who goes, and the clock.
- End: own results summary and three reflection questions (free text, up to 500 characters each): When did your world cooperate best, and why? Did any promise get broken, and how did your group react? What would you do differently? After Reveal results to teams: own world chart and the full leaderboard.
- Takeover screen: This team is now controlled from another computer.
- Always: a reconnecting banner that says decisions are safely saved on the instructor computer.
8.4 Instructor: two screens, and which one is showing is not a choice. Before the briefing it is the start screen; from the briefing on it is the live screen.
- Start screen (/instructor), read top to bottom: five numbered steps and nothing else. STEP 1 PRINT TEAM CARDS: all 9 cards on the page as a grid, worlds as rows and countries A, B, C as columns, each card showing the country, the world, a large join code, a QR code and the join address, with a primary "Print cards" button (/instructor/cards is black on white, 4 cards a page, with cut lines). STEP 2 OPEN THE PROJECTOR: a button plus the address in large monospace. STEP 3 CONNECT THE TEAM COMPUTERS: a live 3 x 3 grid of Waiting or Connected with a count ("7 of 9 connected") and the network check in one line (SPEC 8.6). STEP 4 HOW THE CLASS RUNS: five or six numbered one-line steps with rough minutes. STEP 5 START: a large primary "Start briefing" button, which works even when some computers are not connected and then says "2 not connected yet. They can join late." In the corner, small: Lesson settings and Materials.
- Lesson settings (/instructor/settings): preset picker; number of worlds; a live preview of the cooperative and competitive outcomes; advanced settings folded away (a, b, cost, capacity, starting output, years, timers, disclosure, variance, communication schedule, new producer year, output and announced or not, final-year warning, role rotation, autoClose, projectorShowsPrices). Save and load settings as JSON. Settings can only be changed in the lobby.
- Live screen (/instructor), top to bottom. (1) Status strip: YEAR 5 | STATUS: Deciding | TIME LEFT 1:42 | SUBMITTED 7 / 9 | MESSAGING: OFF; during the briefing it reads BRIEFING | Screen 2 of 4. (2) Next step: one large primary button for the next step in the plan with one line under it saying what it does, and beside it only the controls valid right now (Pause/Resume, +30 s, Close year now). Rarely used actions - Bring in the new producer now, Final-year warning, End game - sit behind a small "More" menu and each asks for confirmation. (3) Messaging: its own boxed panel with a large switch showing OFF or ON in big letters, off by default; turning it on asks how long (2, 3, 4 or 5 minutes, or until I turn it off) and which worlds (all by default); while on it shows a countdown per world and a "Turn off now" button, and it turns off by itself; one plain line explains it; below it a message feed per world with world tabs. The plan's scheduled windows no longer open by themselves: they appear as the next step ("Turn messaging on for 4 minutes") and the button does exactly what the switch does. (4) Countries grid: worlds as columns, countries as rows; each cell shows a connection dot, a tick plus the submitted number (or a dash), and "auto" when it was filled in. A problem shows inside its own cell ("offline"), and if something needs action one line appears under the status strip. There is no separate list of problems. (5) Results: one compact table per world, Year | A | B | C | Total | Price, newest year at the top. (6) Footer, small: the keyboard shortcuts (N for next step, Space for pause). Override a team's decision (reason required, logged). Irreversible actions use an in-app confirmation dialog, never a browser alert.
- Debrief: World Comparison (each world's total profit by year as a percent of the cooperative maximum, and cumulative); World Detail (pick a world: each country's output by year, the price line, markers for messaging windows, summits, new producer and final-year warning; the message timeline; each country's messages sent and total profit); Leaderboard (countries by cumulative profit across all worlds; worlds by total); Game theory (best response and the competitive and cooperative outcomes for the session's settings, and where each world actually ended); Debrief questions (section 10, each with a Show evidence link). Every debrief screen has a Show on projector button.
- Exports: CSV files (decisions, outcomes, messages, reflections) and one full JSON export. Delete session data with a typed confirmation.
- Materials: links to the printable student briefing, role cards, runbook and debrief guide.
8.5 Projector (/projector/:sessionId?k=projectorKey): the same design system at the size a room reads, with 2px rules. A status strip, one very large timer, and between years each world's price with its change and its results table. It shows MESSAGING ON - 3:12 when messaging is on, and FINAL YEAR once that has been given. No messages and no news. Lobby: QR code, URL and Find your table. Debrief: whatever the instructor sends.
8.6 Network check (/check): any computer can open it; it measures round-trip time and the connection type (WebSocket or fallback) and reports to the instructor dashboard (Network check: 9 of 9 OK).

## 9. Technical requirements
- Node.js 20 or newer, TypeScript strict, npm, one package (no monorepo tools).
- Folders: src/shared (types, zod schemas, engine, protocol, views), src/server (Express and Socket.IO), src/client (React and Vite), tests (unit, integration, e2e, bots), docs.
- Express serves the built client and /api/health. Socket.IO carries all live traffic with transports websocket and polling.
- The server is authoritative. Clients send commands; they never compute results or decide phase changes.
- Every command is validated with zod, permission-checked, and carries a client-generated commandId. Commands are idempotent: a repeated commandId returns the original result and never applies twice. State-changing commands carry expectedPhase and expectedYear and are rejected if stale. Replies are acks { ok, code, message } with friendly messages.
- After every state change the server sends each connected client its own full view with a version number. Views are small; no diffs.
- Timers: the server stores deadline timestamps; a 1-second tick closes overdue phases; clients show countdowns using a server-time offset.
- Persistence, with no database server and no native modules: data/sessions/<sessionId>/events.jsonl - every accepted command is appended and fsynced BEFORE anything is broadcast; snapshot.json is written atomically (temporary file then rename) at every phase change. On startup each session loads from its snapshot plus later events. A phase that was running comes back PAUSED with its remaining time, and the dashboard says Resumed after restart - press Resume.
- Reconnect: terminals and the instructor keep their token in localStorage, rejoin automatically and receive a fresh view.
- Terminal claim: one active terminal per team. Claiming a team whose terminal has been disconnected for more than 15 s is allowed and takes over. Claiming a team whose terminal is connected needs instructor approval.
- Keys: an instructorKey (random, at least 24 characters) in the instructor link; a separate read-only projectorKey; a terminalToken issued at claim. The instructor key never appears on the projector.
- Launch: npm run class builds if needed, starts on 0.0.0.0 (port 3000 or the next free one), prints every local network address, the instructor link and a QR code in the terminal, and opens the instructor page.
- No internet at runtime: no CDNs, no web fonts from the internet, no analytics, no external calls.
- Accessibility: semantic HTML, labeled inputs, visible focus, full keyboard use, aria-live announcements for results and timer milestones (60, 30 and 10 s), never color alone, WCAG AA contrast, base font at least 16 px, layouts from 1024x768 up and on tablets, very large projector type, a data table behind every chart.
- Privacy: only optional first names typed on terminals; no student accounts; all data stays on the instructor computer in data/; the instructor can delete it.
- Language: plain English, short sentences, about grade 8 reading level, kind tone, no shaming words.
- Performance: 6 worlds (18 terminals) plus instructor and 2 projectors with 95% of acks under 300 ms on a normal laptop.

## 10. Debrief questions (shown in the instructor's debrief deck)
1 Which world came closest to the cooperative maximum, and what did it do differently in Years 1-3? (LG1)
2 In which year did your world's cooperation break, and what happened just before? (LG3)
3 How did your first decision set the tone? (LG3)
4 What did your Envoy pledge, and did your group keep it? (LG2)
5 Did the price drop after the new producer arrived change your trust? Did anyone use it as cover? (LG6)
6 What happened after the final-year warning, and why? (LG6)
7 If the other two produce [cooperative share] each, what is your best output? Why is everyone at [cooperative share] not stable? (LG4; fill numbers from the session's settings)
8 Why did the price change most in the year it did? (LG5)
9 Whose suggestion became the group's decision most often? Did the Operator have extra influence? (LG2)
10 Where outside class do people face this same dilemma? (transfer)

## 11. Testing requirements
- Unit: engine vectors V1-V8, BR1-BR2, CM1, determinism, variance bounds, input parsing, settings validation, views.
- Messaging: the server refuses a message when messaging is off for that world; the switch works per world and for all worlds; a window turns off by itself at the end of its time; every terminal and the projector are sent the current state; turning it on from the plan step and from the switch leave the same state.
- Removals: every removed command type is refused with a message a person can read, and no removed panel is rendered.
- Integration: a real server with socket.io-client bots for every command, permission, phase, timer, chat, visibility and persistence rule.
- Simulation: npm run simulate plays a complete bot game.
- Load: npm run loadtest.
- End to end: Playwright full game with 1 instructor, 1 projector and 9 terminal browser contexts using test-fast.
- Accessibility: axe checks on the main pages.
- npm run verify runs all of these and must pass before any phase is called done.

## 12. Changelog

### v2.0 - clarity redesign
Every screen was redesigned around one rule, written down as SPEC 8.0: an element has to answer a question the user has at that moment. Nine features were removed because none of them did.

Removed from the team terminal:
1. The "Quick check" questions at the end of the briefing.
2. The Huddle panel, which recorded each member's suggested number and a reason.
3. "While you wait": the predictions of the other countries' output and the trust rating, and the debrief charts and exports built on them.
4. The What-if calculator. Students reason about the market themselves; nothing computes a hypothetical price or profit for them.
5. The News panel and every news banner, everywhere, including the projector.
6. Promises: the "Promised" and "Promise kept?" columns and the structured pledge that fed them. Plain chat messages stay.
7. The Analyst role, which only existed to run the calculator and the forecasts. Operator and Envoy remain.

Removed from the teacher's screens:
8. The Announcement button, and with it instructor announcements as a kind of message.
9. The Change demand button and the optional demand event setting.

Removed as a consequence, each logged in docs/DECISIONS.md:
- The chat mode setting (off / windowsOnly / always), replaced by the messaging switch in section 6.
- The steppers and the slider in the decision box, which set the same number as the field beside them.
- The v1 dark theme. One light theme, which also reads better on a projector.
- The "Things to look at" list on the dashboard: a problem now shows in the cell it belongs to.

Added:
- The messaging switch: one control, held per world, off by default, with its own command and its own tests.
- src/client/theme.css: one file holding every colour, space, rule weight, font stack and type size.
- A separate teacher start screen and live screen, and a lesson settings page of its own.
- CSV exports are four files plus the JSON, not six plus the JSON.

A session saved by v1 still opens: the loader drops every removed field on the way in, and an event-log line for a removed command is skipped without a warning.

### v2.1 - round plan and automatic progression
- Lesson settings ask for the number of rounds, a time for each round (with the total simulation time shown) and, per round, checkboxes for messaging, face-to-face talks and every world's totals on the projector. The number of worlds (1 to 6) is on the same page.
- The game can move on by itself: a round closes as soon as every country has submitted, the results stay up for 10 seconds, then the next round opens. New sessions have this on.
- The debrief shows each summary before its detail, and the round-by-round table shows each country's output.

## 13. Out of scope for v2
Student accounts, LMS integration, grading, other languages. Cloud hosting is an optional separate step.
