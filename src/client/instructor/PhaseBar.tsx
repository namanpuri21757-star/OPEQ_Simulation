import { useState } from 'react';
import { MAX_MESSAGE_CHARS, type CommandType } from '@shared/protocol';
import type { InstructorView } from '@shared/views';
import type { PayloadInputOf, SendCommand, SendOptions } from '../net';
import { Button, Confirm, Countdown, type Say } from '../ui';
import { guardsFor, looseSend } from './commands';

/**
 * The phase bar (SPEC 8.4): one big button, and everything else smaller.
 *
 * The big button is whatever the server's `nextSuggestedAction` says, label and
 * all. The dashboard never works out the next step for itself, which is the
 * whole point: the schedule lives in the settings on the server, so a teacher
 * who only ever presses this button still runs the lesson as planned, and a
 * second dashboard open on another laptop says exactly the same thing.
 *
 * The guards travel with the suggestion rather than being read off the live view,
 * so a button that was already out of date when it was clicked is refused by the
 * server instead of being applied to the next year.
 */
const PHASE_WORDS: Record<InstructorView['phase'], string> = {
  LOBBY: 'Lobby',
  BRIEFING: 'Briefing',
  PRACTICE_OPEN: 'Practice year open',
  PRACTICE_REVEAL: 'Practice results',
  YEAR_OPEN: 'Year open',
  YEAR_REVEAL: 'Results',
  BETWEEN: 'Talking time',
  ENDED: 'Game over',
};

/** How many seconds the "+30 s" button adds. */
export const EXTEND_SECONDS = 30;

type Pending =
  | { kind: 'closeNow' }
  | { kind: 'endGame' }
  | { kind: 'event'; event: 'newProducer' | 'demand' }
  | { kind: 'finalYear' };

export interface PhaseBarProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
  serverNow(): number;
  /**
   * Whether the suggested action's confirmation is open. It is owned by the
   * dashboard rather than by this component because the N shortcut opens the
   * same dialog, and one owner means the key and the click cannot disagree.
   */
  askingSuggested: boolean;
  onAskSuggested(): void;
  onCancelSuggested(): void;
}

export function PhaseBar({
  view,
  send,
  onSaid,
  serverNow,
  askingSuggested,
  onAskSuggested,
  onCancelSuggested,
}: PhaseBarProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [announcing, setAnnouncing] = useState(false);
  const [text, setText] = useState('');
  const [toWorld, setToWorld] = useState('');
  const [busy, setBusy] = useState(false);

  const guards = guardsFor(view);
  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';

  const run = async <T extends CommandType>(
    type: T,
    payload: PayloadInputOf<T>,
    options: SendOptions | undefined,
    good: string,
  ) => {
    setBusy(true);
    const ack = await send(type, payload, options);
    setBusy(false);
    onSaid(ack.ok ? good : ack.message, ack.ok ? 'good' : 'bad');
  };

  const suggested = view.suggested;

  const doSuggested = async () => {
    if (suggested.command === null) return;
    setBusy(true);
    const ack = await looseSend(send)(suggested.command as CommandType, suggested.payload, {
      expectedPhase: suggested.expectedPhase,
      expectedYear: suggested.expectedYear,
    });
    setBusy(false);
    onSaid(ack.ok ? `Done: ${suggested.label}.` : ack.message, ack.ok ? 'good' : 'bad');
  };

  const announce = async () => {
    const trimmed = text.trim();
    if (trimmed === '') return;
    setBusy(true);
    const ack = await send('announce', {
      text: trimmed,
      ...(toWorld === '' ? {} : { worldId: toWorld }),
    });
    setBusy(false);
    if (ack.ok) {
      setText('');
      setAnnouncing(false);
      onSaid('Announcement sent.', 'good');
    } else {
      onSaid(ack.message, 'bad');
    }
  };

  const nextIsFinal = view.year + 1 === view.settings.years;

  return (
    <section className="phase-bar" aria-labelledby="phase-heading">
      <h2 className="visually-hidden" id="phase-heading">
        Where the game is, and what to do next
      </h2>

      <div className="phase-where">
        <p className="phase-name">{PHASE_WORDS[view.phase]}</p>
        <p className="phase-year">
          {view.phase === 'LOBBY' || view.phase === 'BRIEFING'
            ? ''
            : view.year === 0
              ? 'PRACTICE'
              : view.yearLabel}
        </p>
        {timed && (
          <Countdown
            deadline={view.timing.deadline}
            remainingMs={view.timing.remainingMs}
            paused={view.timing.paused}
            serverNow={serverNow}
            closedLabel="Time is up"
          />
        )}
        {view.timing.paused && (
          <p className="phase-paused" role="status">
            {view.timing.resumedAfterRestart
              ? 'Resumed after restart - press Resume'
              : 'Paused. Press Resume when the room is ready.'}
          </p>
        )}
      </div>

      {/* A group with a name, because the suggested action's label can read the
          same as one of the secondary controls ("Announce the final year"), and
          the two must stay tellable apart by a screen reader and by a test. */}
      <div className="phase-next" role="group" aria-label="The next step">
        <Button
          tone="primary"
          size="large"
          disabled={suggested.command === null || busy}
          onClick={onAskSuggested}
        >
          {suggested.label}
        </Button>
        <p className="hint">
          This is the next step in your plan. Press <kbd>N</kbd> for the same thing.
        </p>
      </div>

      <div className="phase-controls" role="group" aria-label="Other controls">
        {view.timing.paused ? (
          <Button
            onClick={() => void run('resume', {}, undefined, 'Running again.')}
            disabled={!timed || busy}
          >
            Resume
          </Button>
        ) : (
          <Button
            onClick={() => void run('pause', {}, undefined, 'Paused.')}
            disabled={!timed || busy}
          >
            Pause
          </Button>
        )}
        <Button
          onClick={() =>
            void run('extend', { seconds: EXTEND_SECONDS }, undefined, '30 seconds added.')
          }
          disabled={!timed || busy}
        >
          {`+${String(EXTEND_SECONDS)} s`}
        </Button>
        <Button onClick={() => setPending({ kind: 'closeNow' })} disabled={!open || busy}>
          Close now
        </Button>
        <Button onClick={() => setAnnouncing(true)} disabled={busy}>
          Announcement
        </Button>
        <Button onClick={() => setPending({ kind: 'event', event: 'newProducer' })} disabled={busy}>
          Bring in the new producer
        </Button>
        <Button onClick={() => setPending({ kind: 'event', event: 'demand' })} disabled={busy}>
          Change demand
        </Button>
        <Button
          onClick={() => setPending({ kind: 'finalYear' })}
          disabled={busy || view.finalYearAnnounced || !nextIsFinal}
        >
          Announce the final year
        </Button>
        <Button onClick={() => setPending({ kind: 'endGame' })} disabled={busy}>
          End game
        </Button>
      </div>

      {askingSuggested && suggested.command !== null && (
        <Confirm
          title={`${suggested.label}?`}
          confirmLabel={`Yes, ${suggested.label.toLowerCase()}`}
          busy={busy}
          onCancel={onCancelSuggested}
          onConfirm={() => {
            onCancelSuggested();
            void doSuggested();
          }}
        >
          <p>This is the next step in your plan. The whole room moves on together.</p>
        </Confirm>
      )}

      {pending?.kind === 'closeNow' && (
        <Confirm
          title="Close this year now?"
          confirmLabel="Yes, close it"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run('closeYear', {}, guards, 'Year closed.');
          }}
        >
          <p>
            Every country that has not submitted repeats its last number, marked auto. This cannot
            be undone.
          </p>
        </Confirm>
      )}

      {pending?.kind === 'endGame' && (
        <Confirm
          title="End the game now?"
          confirmLabel="Yes, end the game"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run('endGame', {}, undefined, 'The game has ended.');
          }}
        >
          <p>
            {open
              ? 'This year is still open. It will be dropped and never scored. Everything already played is kept.'
              : 'Everything played so far is kept. Teams move on to their reflection questions.'}
          </p>
        </Confirm>
      )}

      {pending?.kind === 'finalYear' && (
        <Confirm
          title="Announce the final year?"
          confirmLabel="Yes, announce it"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run('announceFinalYear', {}, guards, 'The final year has been announced.');
          }}
        >
          <p>Every team is told that the next year is the last one. This cannot be taken back.</p>
        </Confirm>
      )}

      {pending?.kind === 'event' && (
        <Confirm
          title={
            pending.event === 'newProducer'
              ? 'Bring the new producer in next year?'
              : 'Change demand next year?'
          }
          confirmLabel="Yes, do it next year"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const event = pending.event;
            setPending(null);
            void run('fireEvent', { kind: event }, guards, 'The event is set for next year.');
          }}
        >
          <p>
            {pending.event === 'newProducer'
              ? `Another producer starts selling ${String(view.settings.newProducer.output)} million barrels a year from the next year on.`
              : `The highest price moves by ${String(view.settings.demandEvent.deltaA)} dollars from the next year on.`}
          </p>
        </Confirm>
      )}

      {announcing && (
        <Confirm
          title="Send an announcement"
          confirmLabel="Send it"
          cancelLabel="Cancel"
          busy={busy}
          onCancel={() => setAnnouncing(false)}
          onConfirm={() => void announce()}
        >
          <p className="field">
            <label htmlFor="announce-text">What should the room read?</label>
            <textarea
              id="announce-text"
              rows={3}
              maxLength={MAX_MESSAGE_CHARS}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </p>
          <p className="field">
            <label htmlFor="announce-world">Who sees it?</label>
            <select
              id="announce-world"
              value={toWorld}
              onChange={(event) => setToWorld(event.target.value)}
            >
              <option value="">Every world</option>
              {view.worlds.map((world) => (
                <option key={world.worldId} value={world.worldId}>
                  {`World ${String(world.worldNumber)} only`}
                </option>
              ))}
            </select>
          </p>
        </Confirm>
      )}
    </section>
  );
}
