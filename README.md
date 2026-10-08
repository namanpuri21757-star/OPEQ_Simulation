# Crude Accord

A classroom simulation of three countries sharing one oil market.

Each group of students runs one country's Oil Production Board. Three countries
share a world market. Every simulated year, each group decides how many million
barrels to produce. The more everyone produces, the lower the price falls, for
everyone. Each group is trying to make its own country as much money as it can.

Groups quickly discover the problem at the heart of it: the three of them
together make the most money by holding production down, and each of them
individually makes more by quietly producing a bit extra. They make promises,
keep some of them, break others, and then see what it cost them. That is the
lesson — the tension between what is good for you and what is good for the
group, and what trust is actually worth.

- One lesson, about 50 to 90 minutes. You choose which.
- 25 students works well: 9 groups of 2 or 3, in 3 separate worlds.
- You need one computer per group, and one for yourself. A projector helps.
- **Nothing goes to the internet.** The game runs on your computer, the group
  computers reach you over the local network, and every number stays on your
  machine.

Students may be young, so every screen uses plain, kind language. Nobody is told
they played badly, and no group ever sees another group's private notes.

---

## Contents

1. [Install it once](#install-it-once)
2. [Start it](#start-it)
3. [Run a class](#run-a-class)
4. [Stop it](#stop-it)
5. [Where the data is, and how to delete it](#where-the-data-is-and-how-to-delete-it)
6. [Update it](#update-it)
7. [If something goes wrong](#if-something-goes-wrong)
8. [If the group computers cannot reach you](#if-the-group-computers-cannot-reach-you)
9. [Try it on your own first](#try-it-on-your-own-first)
10. [For developers](#for-developers)

---

## Install it once

You do this once, on the computer you will teach from. It needs the internet,
and it takes about five minutes. After this, the game never needs the internet
again.

1. **Install Node.js.** Go to [nodejs.org](https://nodejs.org), download the
   version marked **LTS**, and run the installer. Accept the defaults.
2. **Put the Crude Accord folder somewhere you own**, such as your Documents
   folder. Not a shared network drive — the game writes files while it runs.
3. **Install the parts.** Double-click the launcher for your computer:
   - macOS: **Start Crude Accord.command**
   - Windows: **Start Crude Accord.bat**

   The first time, it downloads what it needs and then starts the game. You may
   get a warning about an unidentified developer; on macOS, right-click the file
   and choose **Open** instead of double-clicking.

If you prefer typing, open a terminal in the folder and run `npm install` once.

### Say yes to the network question

The first time you start, your computer asks whether to allow incoming network
connections. **You have to say yes, or no group can reach you.**

- **macOS** asks "Do you want the application node to accept incoming network
  connections?" Click **Allow**.
- **Windows** shows "Windows Defender Firewall has blocked some features". Tick
  **Private networks, such as my home or work network** and click **Allow
  access**. You do not need the Public networks box.

This opens nothing to the internet. It lets the computers in your room talk to
your computer, and that is all.

---

## Start it

**Double-click the launcher:**

- macOS: **Start Crude Accord.command**
- Windows: **Start Crude Accord.bat**

Or, if you prefer a terminal, open one in the folder and type:

```
npm run class
```

Either way, a black window opens, checks everything, and then prints what the
room needs:

```
GROUP COMPUTERS - write this on the board:

    http://192.168.1.20:3000/join

Each group then types the six-character code from its card.
Or they can scan this and type only the code:

    [a QR code]
```

Your own dashboard opens in your browser by itself.

**Leave the black window open for the whole lesson.** It is the game. If you
close it, the lesson stops (nothing is lost, but everyone disconnects).

### Before the bell: stop the computer sleeping

A sleeping laptop disconnects every group until it wakes. The launcher reminds
you, because no program can reliably prevent this for you:

- **macOS:** Apple menu → System Settings → Lock Screen → set "Turn display off
  on power adapter when inactive" to **Never**.
- **Windows:** Start → Settings → System → Power & battery → Screen and sleep →
  set both **When plugged in** options to **Never**.

Keep it plugged in, and keep the lid open.

---

## Run a class

The full script, with what to say at each stage and three timed agendas, is on
your dashboard under **Materials**, and also in
[`docs/materials/instructor-runbook.md`](docs/materials/instructor-runbook.md).
The short version:

1. **Start the app** and open your dashboard (it opens itself).
2. **Choose a lesson length** on the setup screen: 50, 75 or 90 minutes. Check
   the live preview underneath, then save.
3. **Print the team cards.** Press **Print team cards** on the dashboard. You get
   one card per group, four to a page, each with a country, a six-character code
   and a QR code.
4. **Get the room joined.** Write the address on the board. Each group opens it
   on its own computer and types the code from its card. Your lobby list fills
   in as they arrive.
5. **Check each computer.** On each group computer, open the `/check` page and
   press **Start the check**. The result appears on that country's row in your
   lobby list. Wait until every row says **OK**.
6. **Press the one big button.** It always says what the next step is: start the
   briefing, start the practice year, close it, open Year 1, and on through the
   chat windows, the summit and the final year. You never have to decide which
   control to use — there is one button, and it tells you what it does. `N` on
   the keyboard does the same thing; `Space` pauses.
7. **Debrief.** When the game ends, press **Reveal results to teams** and then
   work through the debrief screens on your dashboard. **Show on projector** puts
   any one of them on the big screen in large type.

A projector is worth setting up: the dashboard has a **Projector link** button,
and the projector only ever shows what the whole room is allowed to see — never
your key, never anyone's chat.

---

## Stop it

Click on the black window and press **Ctrl+C** (on a Mac too: Control and C, not
Command).

It finishes saving and says so. Everything the class did is on your computer. If
you start again later, your dashboard comes back exactly where it was, paused,
saying **Resumed after restart — press Resume**.

---

## Where the data is, and how to delete it

Everything a class produces is in the **`data`** folder inside the Crude Accord
folder, and nowhere else. No accounts, no cloud, no internet.

What is in there: the decisions each country made, the messages they sent each
other, their private notes and predictions, and the first names a group chose to
type in (which are optional — groups can stay as "Member 1, Member 2").

Three ways to delete it:

- **One game, from the dashboard.** Scroll to the bottom of the dashboard and use
  **Delete this session**. It asks you to confirm.
- **Everything, by hand.** Stop the app, then drag the whole `data` folder to the
  trash. The app makes a fresh one next time it starts.
- **Keep the numbers, drop the writing.** Download the results first (the debrief
  has **Download the results**: six spreadsheet files and one data file), then
  delete the session.

There is a short privacy note written for parents and school policies at
[`docs/materials/privacy-note.md`](docs/materials/privacy-note.md), and on the
dashboard under **Materials**.

---

## Update it

If you are given a new copy of the folder:

1. Stop the app (Ctrl+C in the black window).
2. Copy your **`data`** folder out of the old folder if you want to keep old
   games. Nothing else in the folder is yours.
3. Replace the folder with the new one, and put `data` back if you kept it.
4. Double-click the launcher. It notices the app has changed and rebuilds it
   before starting, which takes a few seconds.

If you work from a git checkout instead: `git pull`, then `npm install`, then
`npm run class`.

---

## If something goes wrong

| What you see                                                             | What to do                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The window closes the moment I double-click it                           | Node.js is probably not installed. Install the LTS version from [nodejs.org](https://nodejs.org) and try again.                                                    |
| "Node.js is not installed on this computer"                              | Install the LTS version from [nodejs.org](https://nodejs.org), then double-click the launcher again.                                                               |
| "Crude Accord cannot save anything in ..."                               | The folder is read-only or on a network drive. Copy the whole folder to your Documents folder and start again.                                                     |
| "Ports 3000 to 3009 are all busy"                                        | Something else on your computer is using them. Close other programs, or start with a port of your choosing: `npm run class -- --port=8080`.                        |
| A group computer says it cannot find the game                            | Check it is on the same Wi-Fi as your computer, and that it typed the address exactly, including the numbers after the colon. See the next section if it persists. |
| A group's row says **Slow** after the network check                      | They will still play. The timer on their screen may look a second behind. Moving them closer to the Wi-Fi point usually fixes it.                                  |
| A group's row says **Not checked yet** and you have been round every one | That computer never reached you. Treat it as a connection problem, not a slow one.                                                                                 |
| A group claimed the wrong country                                        | On the dashboard, press **Release** on that country, then have the group type the code from its own card.                                                          |
| Two computers want the same country                                      | The second one asks you to approve it. Approve it only for the group really at that table.                                                                         |
| A group's computer has died                                              | Give that group another computer, open the address and type the same code. After 15 seconds it takes over by itself; before that, you are asked to approve it.     |
| A group's screen says it is offline                                      | They keep playing. Whatever they submitted is already saved on your computer. If the banner stays, reload their page.                                              |
| A laptop went to sleep                                                   | It rejoins by itself when it wakes. If it does not, reload the page. No data is lost; only the clock on screen was wrong.                                          |
| The projector screen is blank                                            | Press **Projector link** on the dashboard again and open the link it gives you. Check the browser is not on a sleeping tab.                                        |
| My computer restarted in the middle                                      | Start the app again. Your dashboard comes back where it was, paused, saying **Resumed after restart — press Resume**. Press it when the room is ready.             |
| A group ran out of time                                                  | Their country repeats last year's number, marked **auto**. Say it out loud: not deciding is part of the lesson.                                                    |
| You are running out of lesson                                            | Press **End game** at any point. The years already played are scored and the debrief works normally.                                                               |

---

## If the group computers cannot reach you

This is the one thing that can genuinely stop a lesson, and it is usually not
your fault. **Many school networks deliberately block computers from talking to
each other**, even when every machine is on the same Wi-Fi. The group computer
reaches the internet fine and still cannot reach you.

You can tell this apart from an ordinary mistake: if the address works in your
own browser but no group computer can open it, and they are definitely on the
same Wi-Fi, the network is blocking them.

Three ways round it, in the order most teachers find easiest:

### 1. A phone hotspot (works today, needs no permission)

Turn on the personal hotspot on your phone. Join **your** computer to it, then
join **every group computer** to it. Stop the app (Ctrl+C), start it again, and
write the new address on the board.

Hotspots usually allow device-to-device traffic, which is exactly what this
needs. It uses almost no mobile data: nothing goes to the internet, the group
computers only talk to your laptop. Check how many devices your phone's hotspot
allows — some stop at five, which is not enough for nine groups.

### 2. Ask IT (works best, needs notice)

Ask your IT team to allow computers on the student or staff Wi-Fi to reach your
laptop on one port. Tell them:

> I run a local web app on my laptop on port 3000 (HTTP, plus WebSockets on the
> same port). Student laptops on the same subnet need to reach it. Nothing is
> published to the internet and it needs no internet access itself.

Ask a week ahead. On some networks they can also give your laptop a fixed
address, which means the address on the board is the same every lesson.

### 3. Cloud hosting (a separate, optional step)

The app is built to run on one laptop with no internet, and that is how it is
meant to be used. Putting it on a server so computers reach it over the internet
is possible but is **not part of this version** and is not something you should
try to arrange on the morning of a lesson. If your school wants it, that is a
conversation with whoever maintains the app.

---

## Try it on your own first

Please do this before you teach it. It takes about ten minutes and it is the
single best thing you can do to feel ready.

```
npm run demo -- --preset=test-fast --years=4
```

That prints five links: your dashboard, a projector, and three team computers.
Open them all in separate browser windows on one computer and play a short game
against yourself. Each year lasts five seconds, so you reach the debrief fast.

There is a checklist for the day before and the morning of a lesson, with a
one-minute recovery card for when something goes wrong mid-lesson, in
[`docs/DRY-RUN.md`](docs/DRY-RUN.md).

---

## For developers

| Command            | What it does                                                             |
| ------------------ | ------------------------------------------------------------------------ |
| `npm run class`    | The classroom launcher: preflight, start on the local network, QR code.  |
| `npm run dev`      | Development server with reload.                                          |
| `npm run build`    | Builds the client (Vite) and the server (tsc) into `dist/`.              |
| `npm start`        | Runs the built server.                                                   |
| `npm run demo`     | A whole lesson on one computer, through the real screens.                |
| `npm test`         | Unit, integration, acceptance and component tests.                       |
| `npm run verify`   | Everything: types, lint, tests, coverage, simulations, build, load, e2e. |
| `npm run simulate` | A complete robot game, with a results table per world.                   |
| `npm run loadtest` | 50 connections through a full game.                                      |
| `npm run e2e`      | Playwright specs in real browsers.                                       |

The rules the code follows are in [`CLAUDE.md`](CLAUDE.md). The specification is
[`docs/SPEC.md`](docs/SPEC.md) and it is the source of truth. Other documents
worth knowing:

- [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) — every requirement, its test and
  its status.
- [`docs/READINESS-REPORT.md`](docs/READINESS-REPORT.md) — what has been verified
  and what has not, including the two things only a real classroom can prove.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — every choice made where the spec was
  silent, with the reason.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — what was built in each phase and how to
  see it.
- [`docs/ECONOMICS.md`](docs/ECONOMICS.md) — the economics in plain language.
- [`docs/PROTOCOL.md`](docs/PROTOCOL.md) and
  [`docs/STATE-MACHINE.md`](docs/STATE-MACHINE.md) — the wire protocol and the
  phases.

Crude Accord is original work. It is inspired by the publicly described
structure of business-school cartel negotiation exercises and copies none of
them.
