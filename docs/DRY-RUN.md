# Dry run

Two checklists and a recovery card. Print this, or keep it open on your phone.

The first checklist is the day before. The second is twenty minutes before the
bell. The recovery card is for the middle of a lesson, when you have one minute
and a room watching you.

Tick the boxes. The point of a dry run is that nothing in the lesson is the
first time you have done it.

---

## The day before

About twenty minutes, on your own, on the computer you will teach from.

### Play a short game end to end

- [ ] Open a terminal in the Crude Accord folder and run:

      npm run demo -- --preset=test-fast --years=4

- [ ] It prints five links. Open the **instructor** link in one browser window.
- [ ] Open the **projector** link in a second window. Put it on your second
      screen if you have one.
- [ ] Open the **three team** links in three more windows, one per country. The
      second and third will ask whether to use that window for the new code
      instead — say yes. (In a classroom each group has its own computer and the
      question never comes up.)
- [ ] In the instructor window, press the one big button. Read what it says each
      time before you press it.
- [ ] In each team window, type a number and press **Submit**, then confirm. Do
      it differently in each: one cooperative (around 38), one greedy (around
      60), one that does not submit at all so you see an **auto** decision.
- [ ] Play through the practice year and Years 1 to 4. Each year lasts five
      seconds, so let the timer close some of them for you.
- [ ] In the chat window, send a promise from one team ("We will produce 38.3")
      and then have that team produce something else. Watch the reveal mark it.
- [ ] Press **End the game**, then **Reveal results to teams**.
- [ ] Open each debrief screen: **World comparison**, **World detail**,
      **Leaderboard**, **Game theory**, **Questions**.
- [ ] Press **Show on projector** on one of them and watch the projector window
      follow. Then press **Back to the room screen**.
- [ ] Press **Download the results** and open one of the CSV files in your
      spreadsheet program, so you know it works before you need it.

### Print what you will hand out

- [ ] On the dashboard, press **Print team cards**. Print it. Cut the cards up —
      one per group, each with a country, a code and a QR code.
- [ ] Press **Materials** in the header and print the **student briefing** and
      the **role cards**, one set per group.
- [ ] Read the **instructor runbook** on that page. It has the agenda for your
      lesson length and a line to say at each stage.
- [ ] Decide now which table is the summit table for each world, and write it on
      your runbook.

### Check the projector

- [ ] Plug the projector in and mirror or extend to it, whichever your room
      uses.
- [ ] Put the projector window on the projector and make it full screen (F11, or
      Control-Command-F on a Mac).
- [ ] Walk to the back of the room and read the price off it. If you cannot, the
      room is too bright or the window is not full screen.
- [ ] Check your own dashboard is **not** the thing being projected. Your
      dashboard has your instructor key on it.

### Stop the computer sleeping

- [ ] **macOS:** Apple menu → System Settings → Lock Screen → "Turn display off
      on power adapter when inactive" → **Never**.
- [ ] **Windows:** Start → Settings → System → Power & battery → Screen and
      sleep → both **When plugged in** options → **Never**.
- [ ] Find your charger and put it in your bag.

### Finally

- [ ] Press Ctrl+C in the black window to stop the demo.
- [ ] Decide what to do with the practice data: either delete it from the
      dashboard (**Start over, or clear up** → **Delete this game's data**), or
      leave it — you will make a fresh session tomorrow either way.

---

## In the classroom, before students arrive

Twenty minutes is comfortable. Ten is enough if the day before went well.

### Get yourself running

- [ ] Plug the laptop in.
- [ ] Double-click **Start Crude Accord.command** (macOS) or
      **Start Crude Accord.bat** (Windows). Or run `npm run class`.
- [ ] If your computer asks about incoming network connections, say **Allow**
      (macOS) or tick **Private networks** and **Allow access** (Windows).
- [ ] Read the address it prints. Write it on the board, big.
- [ ] Your dashboard opens by itself. On the setup screen, pick your lesson
      length, set the number of worlds, and save.

### Connect every group computer

Do this table by table. Take the cards with you.

- [ ] On the group's computer, open the address from the board.
- [ ] Type the six-character code from that table's card. Confirm the country.
- [ ] Leave the member names blank for now — the group types their own.
- [ ] On the **same computer**, open the `/check` page (the address from the
      board with `/check` on the end instead of `/join`) and press **Start the
      check**.
- [ ] Walk back to your dashboard and look at the lobby list. That country's row
      should now say **OK** and a number of milliseconds.
- [ ] Repeat for every table.

### Before you let anyone sit down

- [ ] Every row in the lobby list says **Connected**.
- [ ] Every row's network check says **OK**. A row saying **Slow** will still
      play, a second behind — note which table it is. A row saying **Not checked
      yet** means that computer never reached you: fix it now, not in Year 3.
- [ ] If no group computer can reach you at all, go straight to the hotspot
      option in [README.md](../README.md#if-the-group-computers-cannot-reach-you).
      Do not spend twenty minutes on the school Wi-Fi.
- [ ] The projector window is up, full screen, and showing the join address and
      QR code.

### Clear the test session

Everything above left decisions and claims on the board. Clear them, keeping the
computers connected:

- [ ] On the dashboard, open **Start over, or clear up**.
- [ ] Press **Play again with this class**, type `RESET`, and confirm.
- [ ] Check the lobby list again: every country still **Connected**, every code
      still the same, and no decisions. The group computers do not have to do
      anything.

You are ready. Hand out the cards, the briefing and the role cards as groups sit
down.

---

## The one-minute recovery card

Keep this one visible. Each of these has happened; none of them loses a lesson.

### My laptop restarted, or I closed the window

Everything the class did is already on disk — nothing is saved after it is
shown, it is saved before.

1. Start it again: double-click the launcher, or `npm run class`.
2. Your dashboard comes back by itself, **paused**, saying
   **Resumed after restart — press Resume**.
3. Tell the room: "Give me ten seconds, nothing is lost."
4. Press **Resume** when they are ready. The year carries on with the time that
   was left on it.

If the browser forgot which game it was (a new profile, or a wiped browser), the
black window prints a link that gets you back in — look for "A game is already
saved on this computer".

### A group's computer has died

1. Give that group any spare computer — or let them share a neighbour's for one
   year while you fix it.
2. Open the address from the board on the new computer.
3. Type **the same code** from that group's card.
4. If the old computer had been off for more than 15 seconds, the new one takes
   over straight away. If not, your dashboard asks you to approve it — press
   **Approve new computer for ...**.
5. The group's earlier decisions are all still there. Any year they missed is
   filled in automatically and marked **auto**.

If the group has no computer at all for the rest of the lesson, say so and carry
on: their country repeats its last number every year, marked **auto**, and the
other two groups get a complete game.

### The projector has gone blank

The projector is a spectator. Nothing in the lesson depends on it.

1. Carry on with the lesson. Say "give me a second" and keep the year running.
2. On your dashboard, press **Projector link** and open the link it gives you on
   the projector screen again.
3. Make it full screen.
4. It comes back on whatever you were showing, with no key and no chat on it.

If the projector will not come back at all, read the price and the world total
off your own dashboard out loud instead. The lesson works without it.

### A group is being unkind in the chat

1. On the dashboard, find that country and press **Mute**.
2. Say out loud why, once, to the room, and that it is for this chat window only.
3. Unmute them before the next one.

### I am running out of lesson

1. Press **End the game** whenever you like.
2. The years already played are scored normally and the debrief works exactly
   the same.
3. A six-year game debriefs as well as a twelve-year one. Finishing the debrief
   matters more than finishing the years.
