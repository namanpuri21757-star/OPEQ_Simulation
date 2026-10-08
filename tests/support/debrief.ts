/**
 * A played game, for the tests of the debrief screens.
 *
 * It is a real session run through the real debriefFor, rather than a hand-made
 * DebriefData: a component test then fails if a screen reads a field the server
 * would never fill, and the numbers on screen are numbers the engine produced.
 *
 * The story: World 1 holds an agreement for two years and then Ardonia goes to
 * capacity after saying in a message that it would not. World 2 competes from
 * the start.
 */

import { debriefFor, type DebriefData } from '../../src/shared/debrief.js';
import type { SessionState } from '../../src/shared/state.js';
import { addChat, makeSession, setReflection, type Triple } from './session.js';

export const SHARE = 383;
const COOPERATING: Triple = [SHARE, SHARE, SHARE];
const A_CHEATS: Triple = [750, SHARE, SHARE];
const COMPETING: Triple = [575, 575, 575];

export function playedSession(): SessionState {
  const state = makeSession({
    plays: [
      [COOPERATING, COOPERATING, A_CHEATS],
      [COMPETING, COMPETING, COMPETING],
    ],
    practice: [COOPERATING, COOPERATING],
    autos: ['3:C'],
  });

  state.activitiesDone = ['2:chat'];
  addChat(state, 1, 'B', 1, 'Shall we all keep to an equal share?');
  addChat(state, 1, 'A', 3, 'We will produce 38.3 million barrels.');
  addChat(state, 1, 'B', 3, 'We will produce 38.3 million barrels too.');
  setReflection(state, 1, 'B', ['Years 1 and 2.', 'Ardonia broke its promise.', 'Trust less.']);
  return state;
}

export function playedDebrief(): DebriefData {
  return debriefFor(playedSession());
}

/** A session with no scored year, for the "nothing to show" cases. */
export function emptyDebrief(): DebriefData {
  return debriefFor(makeSession({ plays: [[]] }));
}
