import { useState } from 'react';
import { MESSAGING_MINUTES } from '@shared/protocol';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Badge, Button, Countdown, type Say } from '../ui';

/**
 * The messaging switch (SPEC 8.4).
 *
 * This panel exists because v1's answer to "can the students talk right now?"
 * was spread across a chat-mode setting, a scheduled phase and a per-team mute,
 * and no screen said the answer in one place. Now there is one switch, it is off
 * by default, it says OFF or ON in letters big enough to read across a desk, and
 * one line explains exactly what it does.
 *
 * Turning it on asks two questions and no more: how long, and which worlds.
 * Turning it off asks nothing.
 *
 * The same command the plan's next step sends is the command this switch sends,
 * so the two can never leave the game in different states.
 */
export type HowLong = (typeof MESSAGING_MINUTES)[number] | 'open';

export interface MessagingPanelProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
  serverNow(): number;
}

export function MessagingPanel({ view, send, onSaid, serverNow }: MessagingPanelProps) {
  const [asking, setAsking] = useState(false);
  const [howLong, setHowLong] = useState<HowLong>(4);
  const [worlds, setWorlds] = useState<string[] | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);

  const rows = view.messaging;
  const on = rows.filter((row) => row.on);
  const anyOn = on.length > 0;

  const turnOn = async () => {
    setBusy(true);
    const ack = await send('setMessaging', {
      on: true,
      ...(worlds === null ? {} : { worldIds: worlds }),
      ...(howLong === 'open' ? {} : { seconds: howLong * 60 }),
    });
    setBusy(false);
    if (ack.ok) {
      setAsking(false);
      onSaid('Messaging is on.', 'good');
    } else onSaid(ack.message, 'bad');
  };

  const turnOff = async () => {
    setBusy(true);
    const ack = await send('setMessaging', { on: false });
    setBusy(false);
    onSaid(ack.ok ? 'Messaging is off.' : ack.message, ack.ok ? 'good' : 'bad');
  };

  const toggleWorld = (worldId: string) => {
    setWorlds((current) => {
      const all = rows.map((row) => row.worldId);
      const base = current ?? all;
      const next = base.includes(worldId)
        ? base.filter((id) => id !== worldId)
        : [...base, worldId];
      // Back to everything selected means "all worlds" again, which is the
      // default the command sends when no worlds are named.
      return next.length === all.length ? null : next;
    });
  };

  const selected = worlds ?? rows.map((row) => row.worldId);
  const shown = view.worlds[tab] ?? view.worlds[0];
  const feed = shown ? (view.messagesByWorld[shown.worldId] ?? []) : [];

  return (
    <section className="box" aria-labelledby="messaging-heading">
      <h2 className="visually-hidden" id="messaging-heading">
        Messaging
      </h2>

      <div className="switch">
        <span className={`switch-state ${anyOn ? 'switch-on' : 'switch-off'}`} aria-hidden="true">
          {anyOn ? 'ON' : 'OFF'}
        </span>
        <span className="switch-label">Messaging</span>
        {anyOn ? (
          <Button onClick={() => void turnOff()} disabled={busy}>
            Turn off now
          </Button>
        ) : asking ? (
          <Button onClick={() => setAsking(false)} disabled={busy}>
            Cancel
          </Button>
        ) : (
          <Button onClick={() => setAsking(true)}>Turn messaging on</Button>
        )}
        <span className="visually-hidden" role="status">
          {anyOn ? 'Messaging is on.' : 'Messaging is off.'}
        </span>
      </div>

      <p className="note" style={{ marginTop: 'var(--s3)' }}>
        When on, each country can send messages to the other two countries in its world. You see
        every message.
      </p>

      {asking && !anyOn && (
        <>
          <div className="messaging-choices">
            <fieldset className="choice-group">
              <legend>How long?</legend>
              {MESSAGING_MINUTES.map((m) => (
                <label className="choice" key={m}>
                  <input
                    type="radio"
                    name="how-long"
                    checked={howLong === m}
                    onChange={() => setHowLong(m)}
                  />
                  {`${String(m)} minutes`}
                </label>
              ))}
              <label className="choice">
                <input
                  type="radio"
                  name="how-long"
                  checked={howLong === 'open'}
                  onChange={() => setHowLong('open')}
                />
                Until I turn it off
              </label>
            </fieldset>

            <fieldset className="choice-group">
              <legend>Which worlds?</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="which-worlds"
                  checked={worlds === null}
                  onChange={() => setWorlds(null)}
                />
                All worlds
              </label>
              {rows.map((row) => (
                <label className="choice" key={row.worldId}>
                  <input
                    type="checkbox"
                    checked={selected.includes(row.worldId)}
                    onChange={() => toggleWorld(row.worldId)}
                  />
                  {`World ${String(row.worldNumber)}`}
                </label>
              ))}
            </fieldset>
          </div>

          <p className="btn-row" style={{ marginTop: 'var(--s4)' }}>
            <Button onClick={() => void turnOn()} disabled={busy}>
              {howLong === 'open'
                ? 'Turn messaging on until I turn it off'
                : `Turn messaging on for ${String(howLong)} minutes`}
            </Button>
          </p>
        </>
      )}

      {anyOn && (
        <div className="messaging-clocks" aria-label="Time left in each world">
          {on.map((row) => (
            <span key={row.worldId}>
              <span className="strip-key">{`World ${String(row.worldNumber)}`}</span>{' '}
              {row.until === null ? (
                'until you turn it off'
              ) : (
                <Countdown
                  deadline={row.until}
                  remainingMs={null}
                  paused={false}
                  serverNow={serverNow}
                  closedLabel="0:00"
                />
              )}
            </span>
          ))}
        </div>
      )}

      {view.worlds.length > 0 && (
        <>
          <div className="box-head" style={{ marginTop: 'var(--s5)', marginBottom: 0 }}>
            <span className="label label-muted">Messages</span>
            <span className="label label-muted">Newest first</span>
          </div>

          <div className="tabs" role="tablist" aria-label="Messages by world">
            {view.worlds.map((world, index) => (
              <button
                key={world.worldId}
                className="tab"
                type="button"
                role="tab"
                aria-selected={index === tab}
                onClick={() => setTab(index)}
              >
                {`World ${String(world.worldNumber)}`}
              </button>
            ))}
          </div>

          {feed.length === 0 ? (
            <p className="note" style={{ marginTop: 'var(--s3)' }}>
              No messages in this world yet.
            </p>
          ) : (
            <ul className="feed" tabIndex={0} aria-label="Messages in this world">
              {[...feed].reverse().map((message) => (
                <li key={message.messageId}>
                  <span className="feed-who">
                    <Badge letter={message.letter} size="small" />
                    {message.countryName}
                  </span>{' '}
                  <span className="message-text">{message.text}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
