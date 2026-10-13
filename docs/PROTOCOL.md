# Protocol

Everything between a browser and the server goes over one Socket.IO connection.
There are two messages a client sends (`hello` and `command`) and three the
server sends (`view`, `claimed` and `gone`). The schemas live in
`src/shared/protocol.ts` and both sides import them, so the two cannot disagree.

## 1. hello

The first thing every socket sends. It says who the client is and proves it.

| Role         | Sends                             | Proves itself with                |
| ------------ | --------------------------------- | --------------------------------- |
| `setup`      | nothing else                      | nothing; may only `createSession` |
| `instructor` | `sessionId`, `instructorKey`      | the key in the instructor link    |
| `projector`  | `sessionId`, `projectorKey`       | the separate read-only key        |
| `team`       | `sessionId`, optional `teamToken` | the token issued when it claimed  |
| `check`      | `sessionId`                       | nothing; /check only pings        |

The reply is `{ ok: true, sessionId, role, actor, teamId, serverNow, needsClaim }`
or `{ ok: false, message }`. `needsClaim` is true when a terminal has no valid
token yet, which is the signal to show the join screen. The server sends that
socket its first view immediately afterwards.

## 2. command

```jsonc
{
  "commandId": "a client-generated id",
  "type": "submitDecision",
  "payload": { "tenths": 383 },
  "expectedPhase": "YEAR_OPEN", // guarded commands only
  "expectedYear": 5, // guarded commands only
}
```

- **commandId** makes a command idempotent. Sending the same id twice returns the
  first answer and changes nothing, however the two arrive, and the memory of it
  survives a restart because it is part of the saved state.
- **payload** is validated by the one schema that belongs to that `type`. Unknown
  fields are refused, not ignored.
- **expectedPhase / expectedYear** are required for the commands marked
  `guarded` in `COMMAND_META`. They are compared with the live phase and year, so
  a click that was already out of date when it left the browser is refused rather
  than applied to the wrong year.

Quantities cross the wire as whole tenths of a million barrels (383 is 38.3), and
money never crosses at all: prices come back in cents and profits in thousands of
dollars.

### The commands

| Command                            | Who                | Guarded | What it does                                                     |
| ---------------------------------- | ------------------ | ------- | ---------------------------------------------------------------- |
| `createSession`                    | instructor         |         | Makes a session. Returns the keys and a join code per team.      |
| `updateSettings`                   | instructor         |         | Changes the setup. LOBBY only.                                   |
| `setBriefingSlide`                 | instructor         |         | Shows a briefing screen on every terminal.                       |
| `startPractice`                    | instructor         | yes     | Opens the practice year (year 0).                                |
| `closeYear`                        | instructor, system | yes     | Locks the year, fills missing decisions, resolves every world.   |
| `openYear`                         | instructor, system | yes     | Opens the next scored year. The system sends it when autoAdvance is on. |
| `startBetween`                     | instructor         | yes     | Opens a face-to-face summit on a timer.                          |
| `endBetween`                       | instructor, system | yes     | Ends it.                                                         |
| `pause` / `resume`                 | instructor         |         | Keeps and restores the remaining time.                           |
| `extend`                           | instructor         |         | Adds 1 to 600 seconds.                                           |
| `setMessaging`                     | instructor, system | | Turns messaging on or off, for every world or for some. `seconds` left out means until it is turned off. |
| `fireEvent`                        | instructor         | yes     | Brings the new producer into the next year.                      |
| `announceFinalYear`                | instructor, system | yes     | Only when the next year is the last one.                         |
| `overrideDecision`                 | instructor         | yes     | Replaces a team's number. A reason is required and is logged.    |
| `muteTeam` / `unmuteTeam`          | instructor         |         | Stops or restarts that team's messages.                          |
| `releaseTerminal`                  | instructor         |         | Frees a country so another computer can claim it.                |
| `approveTakeover` / `denyTakeover` | instructor         |         | Answers a waiting terminal.                                      |
| `endGame`                          | instructor         |         | Ends the game. Any open year is dropped.                         |
| `revealResultsToTeams`             | instructor         |         | Opens other worlds and the leaderboard to teams. ENDED only.     |
| `setProjectorScreen`               | instructor         |         | Mirrors a debrief screen; `worldNumber` for World Detail.        |
| `resetSession`                     | instructor         |         | Needs `confirm: "RESET"`.                                        |
| `deleteSession`                    | instructor         |         | Needs `confirm: "DELETE"`.                                       |
| `claimTeam`                        | team               |         | Takes a country with its join code.                              |
| `setMembers`                       | team               |         | 1 to 4 first names, trimmed and filtered.                        |
| `submitDecision`                   | team               | yes     | The year's number. Can be changed until the year closes.         |
| `sendMessage`                      | team               |         | Up to 280 characters, to its own world, while messaging is on.   |
| `submitReflection`                 | team               |         | Three answers of up to 500 characters. ENDED only.               |
| `ping`                             | anyone             |         | Returns `serverNow`. Never saved.                                |
| `report`                           | anyone             |         | A network-check result for the dashboard.                        |

## 3. The ack

Every command is answered on the socket's ack callback.

```jsonc
{ "ok": true,  "commandId": "...", "version": 42, "result": { } }
{ "ok": false, "commandId": "...", "code": "STALE", "message": "The game has moved on..." }
```

`version` is the session's version after the command. The message is written for
a student to read; the code is for the client to act on.

| Code             | When                                                           |
| ---------------- | -------------------------------------------------------------- |
| `NOT_ALLOWED`    | This role may not send that, or the step makes no sense here.  |
| `STALE`          | The guards named a phase or year the game has already left.    |
| `CLOSED`         | The year, the chat window or the game is closed.               |
| `INVALID`        | The payload did not pass validation, or breaks a rule.         |
| `RATE_LIMITED`   | One message per three seconds per team, or a very busy screen. |
| `MUTED`          | The instructor has paused this team's messages.                |
| `NOT_FOUND`      | No such session, team or join code.                            |
| `NEEDS_APPROVAL` | Another terminal is connected; the instructor has been asked.  |
| `STORAGE`        | The command could not be saved, so nothing was changed.        |

Nothing is ever broadcast before it has been appended to `events.jsonl` and
fsynced, so an `ok` ack means the decision is on disk.

## 4. view

After every change the server sends each socket its own full view - never a diff
and never the raw state.

```jsonc
{ "version": 42, "serverNow": 1700000000000, "view": {} }
```

Views are built by copying allowed fields into a new object, so a field added to
the state is invisible until someone deliberately puts it in a view. There are
four shapes, chosen by the socket's role:

- **team** (`kind: "team"`) - its own world only: phase, year, timing, the public
  settings, its own decision, its history as far as the disclosure mode allows,
  the current reveal, its world's messages, whether its own messaging window is
  open and when it closes, its own reflection, and the leaderboard only once the
  instructor releases it.
- **projector** (`kind: "projector"`) - phase, year, timing, whether messaging is
  on and how long is left, whether the final year has been announced, the table
  cards, and a price and results table per world after a reveal when
  `projectorShowsPrices` is on. Once the game has ended, and only while the
  instructor has sent one of the five debrief screens, it also carries the
  debrief. Never a message, never team-private data, never a key.
- **instructor** (`kind: "instructor"`) - everything, including the keys, every
  world's records, every team's reflection, the message feed per world, the
  messaging state per world, who is connected, the one suggested next action,
  and - once the game has ended - the whole debrief.
- **lobby** (`kind: "lobby"`) - what a terminal sees before it has claimed a
  country, and what the /check page gets. Almost nothing.

Each socket is sent at most ten views a second. A burst of decisions therefore
collapses into one message rather than eighteen.

## 5. claimed and gone

Two messages arrive on their own rather than as an ack.

- **claimed** carries a `ClaimTeamResult` to a terminal whose takeover request the
  instructor has just approved.
- **gone** tells a screen it has lost its place: `deleted`, `reset`, `released`,
  `takenOver` or `denied`, each with a sentence to show.

## 6. The system actor

The one-second tick closes an overdue year or activity by sending `closeYear` or
`endBetween` with the actor `system`. Those are validated, saved and broadcast
exactly like a click, so the event log is a complete record of the lesson whether
a human or the clock moved it on.

With `autoAdvance` on, the tick also moves the lesson forward once a year's
results have been up for 10 seconds: it sends `announceFinalYear` when that is
due, then `openYear`, both guarded so a year is never opened twice.

## 7. HTTP

Socket.IO carries everything that changes the game. Three plain HTTP routes sit
beside it, all read-only.

| Route                                        | Who may call it     | What it returns                                                      |
| -------------------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `GET /api/health`                            | anyone              | `{ ok, name, version }`                                              |
| `GET /api/sessions`                          | anyone              | the sessions open here: id, when, phase, whether any country is free |
| `GET /api/sessions/:id/export/:name?k=<key>` | the instructor only | one export file                                                      |

The export route needs the instructor key and answers 403 to anything else, the
projector key included. `:name` is one of `decisions`, `outcomes`, `messages`,
`reflections` (CSV) or `session` (JSON); anything else is a 404 that lists the
real names.

The files are built by the pure functions in `src/shared/exports.ts`. CSV rows
end with CRLF, the body starts with a UTF-8 byte-order mark so a spreadsheet
reads accented names properly, and a cell that would otherwise look like a
formula is prefixed with a quote. Nothing in any file carries a key or a
terminal token.

A download is a link rather than a command because a browser will only save a
file to disk from one, and because the files are far larger than a view.
