import { useState } from 'react';
import { DEBRIEF_SCREENS, type DebriefScreen } from '@shared/debrief';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, type Say } from '../ui';
import { DEBRIEF_TITLES, DebriefScreenView, debriefTitleOf } from '../debrief';

/**
 * The debrief, on the teacher's screen (SPEC 8.4).
 *
 * Five screens, one at a time, each with a **Show on projector** button. The
 * teacher reads the screen here and the room sees the same thing in large type,
 * which is why the numbers and the titles are worked out on the server: there is
 * only one copy of them.
 *
 * Which screen is on the projector is session state, not local state, so a
 * reload or a second laptop still knows what the room is looking at.
 */
export interface DebriefPanelProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
}

export function DebriefPanel({ view, send, onSaid }: DebriefPanelProps) {
  const debrief = view.debrief;
  const worldNumbers = view.worlds.map((world) => world.worldNumber);
  const [screen, setScreen] = useState<DebriefScreen>('worldComparison');
  const [worldNumber, setWorldNumber] = useState<number>(worldNumbers[0] ?? 1);

  if (debrief === null) {
    return (
      <section className="box" aria-labelledby="debrief-heading">
        <h2 id="debrief-heading">Debrief</h2>
        <p>The debrief opens when the game ends. Press the big button to get there.</p>
      </section>
    );
  }

  // What the room is looking at, read off the session rather than remembered
  // here, so a reload or a second laptop says the same thing.
  const showing = (): string => {
    const title = debriefTitleOf(view.projectorScreen);
    if (title === undefined) return 'The projector is showing the room screen.';
    const world =
      view.projectorScreen === 'worldDetail' && view.projectorWorldNumber !== null
        ? ` for World ${String(view.projectorWorldNumber)}`
        : '';
    return `The projector is showing ${title}${world}.`;
  };

  const show = async () => {
    const ack = await send('setProjectorScreen', {
      screen,
      ...(screen === 'worldDetail' ? { worldNumber } : {}),
    });
    onSaid(
      ack.ok ? `The projector is showing ${DEBRIEF_TITLES[screen]}.` : ack.message,
      ack.ok ? 'good' : 'bad',
    );
  };

  const stop = async () => {
    const ack = await send('setProjectorScreen', { screen: 'auto' });
    onSaid(
      ack.ok ? 'The projector is back to the room screen.' : ack.message,
      ack.ok ? 'good' : 'bad',
    );
  };

  return (
    <section className="box" aria-labelledby="debrief-heading">
      <h2 id="debrief-heading">Debrief</h2>

      {debrief.empty && (
        <p>
          No year was scored in this game, so the screens below have little to show. That is normal
          if you ended the lesson early.
        </p>
      )}

      {/* Which screen is showing is a state, not an action, so these are tabs
          rather than a row of buttons: one solid primary per screen (SPEC 8.2)
          and the chosen one reads as selected. */}
      <div className="debrief-tabs tabs" role="tablist" aria-label="Debrief screens">
        {DEBRIEF_SCREENS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            className="tab"
            aria-selected={name === screen}
            onClick={() => setScreen(name)}
          >
            {DEBRIEF_TITLES[name]}
          </button>
        ))}
      </div>

      {screen === 'worldDetail' && view.worlds.length > 1 && (
        <div className="debrief-world-pick">
          <span id="world-pick-label">Which world?</span>
          <div className="tabs" role="tablist" aria-labelledby="world-pick-label">
            {worldNumbers.map((number) => (
              <button
                key={number}
                type="button"
                role="tab"
                className="tab"
                aria-selected={number === worldNumber}
                onClick={() => setWorldNumber(number)}
              >
                {`World ${String(number)}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="debrief-showing">
        <Button tone="primary" onClick={() => void show()}>
          Show on projector
        </Button>
        <span role="status">{showing()}</span>
        {debriefTitleOf(view.projectorScreen) !== undefined && (
          <Button onClick={() => void stop()}>Back to the room screen</Button>
        )}
        {/* A plain link, not a router one: it opens its own tab, so there is
            no in-app navigation to take part in. */}
        <a className="btn" href="/instructor/summary" target="_blank" rel="noreferrer">
          Print-friendly summary
        </a>
      </div>

      <DebriefScreenView
        screen={screen}
        debrief={debrief}
        worldNumber={worldNumber}
        onShowEvidence={(next) => setScreen(next)}
      />
    </section>
  );
}
