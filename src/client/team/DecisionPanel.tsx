import { useId, useMemo, useState } from 'react';
import { toTenths } from '@shared/engine/integers';
import { OPEN_PHASES } from '@shared/state';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import type { KeyValueStore, SendCommand } from '../net';
import { browserStore, clearDraft, readDraft, writeDraft } from '../net';
import { Button, Dialog, type Say } from '../ui';

/**
 * The decision box: the one thing a group must do in an open year (SPEC 8.3).
 *
 * One question, one number, one button. The steppers and the slider v1 had are
 * gone: three controls that set the same number only make a group wonder which
 * one the game is listening to.
 *
 * Submitting goes through a confirmation, because 383 typed instead of 38.3 is
 * the easiest mistake to make with a timer running, and the group can change its
 * mind until the year closes.
 *
 * A number that has been typed but not sent is kept in this browser, under this
 * session and this year. A tab that is closed or a laptop that sleeps mid-year
 * therefore comes back with the number the group had agreed on still in the box
 * (acceptance R1). It is cleared as soon as the server has it, because from then
 * on the server's copy is the only one that counts.
 */
export interface DecisionPanelProps {
  view: TeamView;
  send: SendCommand;
  /** Somewhere to put a short "Saved" or an error, usually a toast. */
  onSaid?: Say | undefined;
  /** Test seam: where the unsent number is kept. */
  store?: KeyValueStore | undefined;
}

/** What the server would fill in if this group ran out of time. */
function autoFillTenths(view: TeamView): number {
  const previous = view.history[view.history.length - 1];
  return previous ? previous.ownTargetTenths : toTenths(view.settings.startingOutput);
}

function closedBecause(view: TeamView): string {
  if (view.phase === 'LOBBY' || view.phase === 'BRIEFING') {
    return 'The first year has not started yet. Your teacher will open it.';
  }
  if (view.phase === 'BETWEEN') {
    return 'The summit is on. You will type your number when the next year opens.';
  }
  if (view.phase === 'ENDED') return 'The game has finished, so there is nothing left to submit.';
  return 'This year is closed. Your teacher will start the next year.';
}

export function DecisionPanel({ view, send, onSaid, store }: DecisionPanelProps) {
  const open = OPEN_PHASES.includes(view.phase);
  const capacityTenths = view.settings.capacityTenths;
  const submitted = view.decision;

  const drafts = useMemo(() => store ?? browserStore(), [store]);

  const [text, setText] = useState(() => {
    if (submitted) return formatQuantity(submitted.tenths);
    const saved = readDraft(drafts, view.sessionId, view.year);
    if (saved !== null && parseQuantity(saved, capacityTenths).ok) return saved;
    return formatQuantity(autoFillTenths(view));
  });
  const [editing, setEditing] = useState(submitted === null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const fieldId = useId();
  const problemId = `${fieldId}-problem`;

  // An instructor override, our own submission, or this screen coming back after
  // a reconnect, all have to show the number the server actually holds. React's
  // pattern for "a prop changed, so adjust state" is to compare while rendering
  // rather than in an effect, which would repaint twice and, worse, would also
  // fire on every unrelated view and wipe what a group is halfway through typing.
  const stamp = submitted === null ? null : `${String(submitted.tenths)}@${String(submitted.at)}`;
  const [seenStamp, setSeenStamp] = useState(stamp);
  if (seenStamp !== stamp) {
    setSeenStamp(stamp);
    if (submitted !== null) {
      setText(formatQuantity(submitted.tenths));
      setEditing(false);
    }
  }

  const parsed = parseQuantity(text, capacityTenths);

  /** Types into the box and keeps the number, so a reload still has it. */
  const typed = (next: string) => {
    setText(next);
    setProblem(null);
    writeDraft(drafts, view.sessionId, view.year, next);
  };

  const ask = () => {
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setProblem(null);
    setAsking(parsed.tenths);
  };

  const confirm = async () => {
    if (asking === null) return;
    setBusy(true);
    const ack = await send('submitDecision', { tenths: asking });
    setBusy(false);
    setAsking(null);
    if (ack.ok) {
      setEditing(false);
      clearDraft(drafts, view.sessionId, view.year);
      onSaid?.(`Submitted ${formatQuantity(asking)} million barrels.`, 'good');
    } else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  const showForm = editing || submitted === null;
  const yearWords = view.isPractice ? 'Practice year' : `Year ${String(view.year)}`;

  return (
    <section className="box" aria-labelledby={`${fieldId}-heading`}>
      <h2 className="decision-question" id={`${fieldId}-heading`}>
        {`${yearWords} - how many million barrels will ${view.countryName} produce?`}
      </h2>

      {!open && <p className="note">{closedBecause(view)}</p>}

      {showForm ? (
        <>
          <div className="decision-entry">
            <div className="field decision-input">
              <label className="field-label" htmlFor={fieldId}>
                Million barrels
              </label>
              <input
                id={fieldId}
                className="input input-big"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                disabled={!open || busy}
                aria-describedby={problem === null ? `${fieldId}-hint` : problemId}
                onChange={(event) => {
                  typed(event.target.value);
                }}
              />
            </div>
            <Button tone="primary" size="large" onClick={ask} disabled={!open || busy}>
              {submitted === null ? 'Submit' : 'Submit the new number'}
            </Button>
            {submitted !== null && (
              <Button
                onClick={() => {
                  setEditing(false);
                  setText(formatQuantity(submitted.tenths));
                  setProblem(null);
                }}
              >
                Keep the number I sent
              </Button>
            )}
          </div>

          <p className="note" id={`${fieldId}-hint`}>
            {`0 to ${formatQuantity(capacityTenths)} million barrels, one decimal place.`}
          </p>

          {problem !== null && (
            <p className="problem" id={problemId} role="alert">
              {problem}
            </p>
          )}

          {open && submitted === null && (
            <p className="note">
              {`If you send nothing, your country produces ${formatQuantity(autoFillTenths(view))} million barrels.`}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="decision-done" role="status">
            {`Submitted: ${formatQuantity(submitted.tenths)} million barrels.`}
            {submitted.auto ? ' Filled in for you.' : ''}
            {submitted.byInstructor ? ' Set by your teacher.' : ''}
          </p>
          <p className="note">
            {open
              ? 'You can change this until the timer ends.'
              : 'That is the number this year was scored with.'}
          </p>
          {open && (
            <p className="btn-row" style={{ marginTop: 'var(--s4)' }}>
              <Button
                onClick={() => {
                  setEditing(true);
                }}
              >
                Change
              </Button>
            </p>
          )}
        </>
      )}

      <p className="note" aria-live="polite" style={{ marginTop: 'var(--s4)' }}>
        {`${String(view.submittedCount)} of 3 countries in your world have submitted.`}
      </p>

      {asking !== null && (
        <Dialog
          title={`Submit ${formatQuantity(asking)} million barrels for ${view.isPractice ? 'the practice year' : view.yearLabel}?`}
          onClose={() => {
            setAsking(null);
          }}
          footer={
            <>
              <Button tone="primary" onClick={() => void confirm()} disabled={busy}>
                Yes, submit
              </Button>
              <Button
                onClick={() => {
                  setAsking(null);
                }}
                disabled={busy}
              >
                No, go back
              </Button>
            </>
          }
        >
          <p>You can change it again until the timer ends.</p>
        </Dialog>
      )}
    </section>
  );
}
