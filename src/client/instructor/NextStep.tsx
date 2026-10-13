import { useState } from 'react';
import type { CommandType } from '@shared/protocol';
import { roundFor, secondsForYear } from '@shared/settings';
import type { InstructorView, SuggestedAction } from '@shared/views';
import type { PayloadInputOf, SendCommand, SendOptions } from '../net';
import { Button, Confirm, StartsIn, type Say } from '../ui';
import { guardsFor, looseSend } from './commands';

/**
 * The next step, and only the controls that are valid right now (SPEC 8.4).
 *
 * The big button is whatever the server's `nextSuggestedAction` says, label and
 * all. The dashboard never works out the next step for itself: the plan lives in
 * the settings on the server, so a teacher who only ever presses this button
 * runs the lesson as planned, and a second dashboard on another laptop says the
 * same thing.
 *
 * Beside it are the controls that can be used at this moment and no others. An
 * action that would be refused is not drawn, rather than drawn grey: a grey
 * button is a thing to wonder about, and a teacher mid-sentence has no time to.
 * The rarely used ones live behind "More", and each of those asks first.
 */
const EXTEND_SECONDS = 30;

type Pending = { kind: 'closeNow' } | { kind: 'endGame' } | { kind: 'newProducer' } | { kind: 'finalYear' };

/** What the round plan turns on for a year, as the end of a sentence. */
function roundNote(year: number, view: InstructorView): string {
  const round = roundFor(year, view.settings);
  if (!round) return '';
  const on = [round.messaging && 'messaging', round.faceToFace && 'face to face'].filter(
    (item): item is string => typeof item === 'string',
  );
  return on.length === 0 ? ' No talking this round.' : ` This round has ${on.join(' and ')}.`;
}

/** One line under the button saying what pressing it does. */
export function explainStep(action: SuggestedAction, view: InstructorView): string {
  switch (action.command) {
    case 'setBriefingSlide':
      return 'Puts the first briefing screen on every terminal and the projector.';
    case 'startPractice':
      return `Opens the practice year with a ${String(view.settings.timers.practiceSeconds)}-second timer. It is never scored.`;
    case 'closeYear':
      return 'Fills in any country that did not submit, then scores every world at once.';
    case 'openYear': {
      const year = Number(action.payload['year'] ?? view.year + 1);
      const seconds = secondsForYear(year, view.settings);
      return `Opens Year ${String(year)} with a ${String(seconds)}-second timer.${roundNote(year, view)}`;
    }
    case 'setMessaging':
      return action.payload['on'] === true
        ? 'Lets every country write to the other two in its world. You see every message.'
        : 'Stops every country writing. The feeds stay readable.';
    case 'startBetween':
      return 'The Envoys leave their computers and meet, one table per world.';
    case 'announceFinalYear':
      return 'Every terminal is told the next year is the last one. It cannot be taken back.';
    case 'endGame':
      return 'No more years. Teams move on to their reflection questions.';
    case 'revealResultsToTeams':
      return 'Teams can then see the other worlds and the leaderboard.';
    default:
      return 'The debrief is below.';
  }
}

export interface NextStepProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
  /**
   * The suggestion the open dialog was opened for, frozen at that moment.
   *
   * Frozen rather than read live: a year can close on its own timer while the
   * dialog is open, and then the live suggestion is a different step. A dialog
   * that said "Close Year 3" must never do something else because the screen
   * changed under it while the teacher was reading.
   */
  asking: SuggestedAction | null;
  onAskSuggested(): void;
  onCancelSuggested(): void;
  /** The server's clock, for the pause before the next year opens by itself. */
  serverNow?: (() => number) | undefined;
}

export function NextStep({
  view,
  send,
  onSaid,
  asking,
  onAskSuggested,
  onCancelSuggested,
  serverNow,
}: NextStepProps) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const guards = guardsFor(view);
  const timed = view.timing.deadline !== null || view.timing.remainingMs !== null;
  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';
  const suggested = view.suggested;
  const nextIsFinal = view.year + 1 === view.settings.years;
  const canBringProducer =
    view.phase === 'YEAR_REVEAL' || view.phase === 'PRACTICE_REVEAL' || view.phase === 'BETWEEN';

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

  /** Runs the step the dialog was opened for, not whatever is suggested now. */
  const doSuggested = async (action: SuggestedAction) => {
    if (action.command === null) return;
    setBusy(true);
    const ack = await looseSend(send)(action.command as CommandType, action.payload, {
      expectedPhase: action.expectedPhase,
      expectedYear: action.expectedYear,
    });
    setBusy(false);
    onSaid(ack.ok ? `Done: ${action.label}.` : ack.message, ack.ok ? 'good' : 'bad');
  };

  /** True when the lesson moved on while the dialog was open. */
  const movedOn =
    asking !== null &&
    (asking.command !== suggested.command ||
      asking.expectedPhase !== suggested.expectedPhase ||
      asking.expectedYear !== suggested.expectedYear);

  return (
    <section className="box" aria-labelledby="next-heading">
      <h2 className="visually-hidden" id="next-heading">
        The next step
      </h2>

      <div className="next-step">
        <div className="next-step-main" role="group" aria-label="The next step">
          {suggested.command === null ? (
            <p className="step-title">{suggested.label}</p>
          ) : (
            <Button tone="primary" size="large" disabled={busy} onClick={onAskSuggested}>
              {suggested.label}
            </Button>
          )}
          <p className="next-step-what">{explainStep(suggested, view)}</p>
          <StartsIn
            at={view.advanceAt}
            what={`Year ${String(view.year + 1)}`}
            serverNow={serverNow}
          />
        </div>

        <div className="btn-row" role="group" aria-label="Controls you can use now">
          {timed &&
            (view.timing.paused ? (
              <Button
                onClick={() => void run('resume', {}, undefined, 'Running again.')}
                disabled={busy}
              >
                Resume
              </Button>
            ) : (
              <Button
                onClick={() => void run('pause', {}, undefined, 'Paused.')}
                disabled={busy}
              >
                Pause
              </Button>
            ))}
          {timed && (
            <Button
              onClick={() =>
                void run('extend', { seconds: EXTEND_SECONDS }, undefined, '30 seconds added.')
              }
              disabled={busy}
            >
              {`+${String(EXTEND_SECONDS)} s`}
            </Button>
          )}
          {open && (
            <Button onClick={() => setPending({ kind: 'closeNow' })} disabled={busy}>
              Close year now
            </Button>
          )}
          <Button
            onClick={() => setMore((value) => !value)}
            aria-expanded={more}
          >
            {more ? 'More ▴' : 'More ▾'}
          </Button>
        </div>
      </div>

      {more && (
        <div className="btn-row" style={{ marginTop: 'var(--s4)' }}>
          {canBringProducer && (
            <Button onClick={() => setPending({ kind: 'newProducer' })} disabled={busy}>
              Bring in the new producer now
            </Button>
          )}
          {nextIsFinal && !view.finalYearAnnounced && view.settings.finalYearWarning && (
            <Button onClick={() => setPending({ kind: 'finalYear' })} disabled={busy}>
              Final-year warning
            </Button>
          )}
          {view.phase !== 'ENDED' && (
            <Button onClick={() => setPending({ kind: 'endGame' })} disabled={busy}>
              End game
            </Button>
          )}
        </div>
      )}

      {view.timing.paused && (
        <p className="note phase-paused" role="status" style={{ marginTop: 'var(--s4)' }}>
          {view.timing.resumedAfterRestart
            ? 'Resumed after restart - press Resume.'
            : 'Paused. Press Resume when the room is ready.'}
        </p>
      )}

      {asking !== null && asking.command !== null && !movedOn && (
        <Confirm
          title={`${asking.label}?`}
          confirmLabel={`Yes, ${asking.label.toLowerCase()}`}
          busy={busy}
          onCancel={onCancelSuggested}
          onConfirm={() => {
            onCancelSuggested();
            void doSuggested(asking);
          }}
        >
          <p>{explainStep(asking, view)}</p>
        </Confirm>
      )}

      {asking !== null && movedOn && (
        <Confirm
          title="The lesson has already moved on"
          confirmLabel="OK"
          cancelLabel="OK"
          onCancel={onCancelSuggested}
          onConfirm={onCancelSuggested}
        >
          <p>
            While that question was open, the lesson moved on by itself - usually a timer running
            out. Nothing has been done.
          </p>
          <p>{`The next step is now "${suggested.label}". Press the big button again if that is what you want.`}</p>
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
          title="Give the final-year warning?"
          confirmLabel="Yes, warn them"
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

      {pending?.kind === 'newProducer' && (
        <Confirm
          title="Bring the new producer in next year?"
          confirmLabel="Yes, do it next year"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            setPending(null);
            void run(
              'fireEvent',
              { kind: 'newProducer' },
              guards,
              'The new producer arrives next year.',
            );
          }}
        >
          <p>
            {`Another producer starts selling ${String(view.settings.newProducer.output)} million barrels a year from the next year on. Nobody is told.`}
          </p>
        </Confirm>
      )}
    </section>
  );
}
