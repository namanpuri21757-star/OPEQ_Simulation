# State machine

Generated from `TRANSITIONS` in `src/server/session/transitions.ts` by `npm run docs`.
Do not edit by hand: a unit test fails if this file and the code disagree.

## Phases

| Phase | What is happening |
| --- | --- |
| LOBBY | Teams claim their countries. Settings can still be changed here. |
| BRIEFING | The four briefing screens, in sync with the instructor. |
| PRACTICE_OPEN | The practice year (year 0) is open. It is never scored. |
| PRACTICE_REVEAL | The practice result is on screen. |
| YEAR_OPEN | A scored year is open and decisions can still be changed. |
| YEAR_REVEAL | The year has been settled and the result is on screen. |
| BETWEEN | A chat window or a face-to-face summit, on a deadline. |
| ENDED | The game is over. Reflections, then results released to teams. |

## Transitions that change the phase

| Command | From | To | Notes |
| --- | --- | --- | --- |
| setBriefingSlide | LOBBY, BRIEFING | BRIEFING | Shows a briefing screen. The first one leaves the lobby. |
| startPractice | LOBBY, BRIEFING | PRACTICE_OPEN | Opens the practice year (year 0). It is never scored. |
| closeYear | PRACTICE_OPEN | PRACTICE_REVEAL | Locks practice, fills missing decisions and resolves every world. |
| closeYear | YEAR_OPEN | YEAR_REVEAL | Locks the year, fills missing decisions and resolves every world. |
| openYear | PRACTICE_REVEAL, YEAR_REVEAL, BETWEEN | YEAR_OPEN | Opens the next scored year. Only ever the year after the current one. |
| startBetween | YEAR_REVEAL | BETWEEN | Runs a face-to-face summit on a timer, while the room moves. |
| endBetween | BETWEEN | YEAR_REVEAL | Ends the activity and goes back to the reveal of the year it followed. |
| endGame | LOBBY, BRIEFING, PRACTICE_OPEN, PRACTICE_REVEAL, YEAR_OPEN, YEAR_REVEAL, BETWEEN | ENDED | Ends the game. Any year still open is dropped and never scored. |
| resetSession | LOBBY, BRIEFING, PRACTICE_OPEN, PRACTICE_REVEAL, YEAR_OPEN, YEAR_REVEAL, BETWEEN, ENDED | LOBBY | Clears every decision, outcome and message. Teams keep their codes. |

## Commands that leave the phase alone

| Command | Allowed during | Notes |
| --- | --- | --- |
| updateSettings | LOBBY | Setup only. |
| pause | PRACTICE_OPEN, YEAR_OPEN, BETWEEN | Keeps the remaining time. |
| resume | PRACTICE_OPEN, YEAR_OPEN, BETWEEN | Rebuilds the deadline. |
| extend | PRACTICE_OPEN, YEAR_OPEN, BETWEEN | Adds 1 to 600 seconds. |
| setMessaging | any phase | Turns messaging on or off, for every world or for some of them. |
| fireEvent | PRACTICE_REVEAL, YEAR_REVEAL, BETWEEN | Between years only. Takes effect in the next year. |
| announceFinalYear | PRACTICE_REVEAL, YEAR_REVEAL, BETWEEN | Only when the next year is the last one. |
| overrideDecision | PRACTICE_OPEN, YEAR_OPEN | Open year only. A reason is required and is logged. |
| muteTeam | any phase | Stops that team sending messages. |
| unmuteTeam | any phase | Lets it send again. |
| releaseTerminal | any phase | Frees a team to be claimed again. |
| approveTakeover | any phase | Hands the team to the new terminal. |
| denyTakeover | any phase | Leaves the team where it is. |
| revealResultsToTeams | ENDED | Opens other worlds and the leaderboard to teams. |
| setProjectorScreen | any phase | Mirrors a debrief screen. |
| deleteSession | any phase | Removes the saved data. |
| claimTeam | any phase | A terminal takes a country. |
| setMembers | any phase | First names, 1 to 4. |
| submitDecision | PRACTICE_OPEN, YEAR_OPEN | Can be changed until the year closes. The last one counts. |
| submitReflection | ENDED | Three questions at the end. |
| sendMessage | any phase | Only while this world’s messaging window is open, and not when muted. |
| report | any phase | A network check result. |

## Timers and pausing

PRACTICE_OPEN, YEAR_OPEN and BETWEEN run on a deadline stored in the state. `pause` keeps the remaining time and clears the deadline; `resume` rebuilds the deadline from the remaining time; `extend` adds 1 to 600 seconds to whichever of the two is in use. A one-second tick sends `closeYear` or `endBetween` as the system actor once a deadline has passed, and those are saved to `events.jsonl` exactly like a click. After a restart a phase that was running comes back paused, with the time it had left.

## The suggested next action

`nextSuggestedAction(session)` in `src/server/session/suggest.ts` decides the one big button on the dashboard. It follows the schedule in the settings: finish the briefing, start practice, close the open year, run any chat window or summit that is due after this year, announce the final year when the next year is the last one, open the next year, end the game, release the results.
