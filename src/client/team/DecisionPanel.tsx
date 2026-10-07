import { useId, useState } from 'react';
import { OPEN_PHASES } from '@shared/state';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, Dialog, NumberStepper, Slider, type Say } from '../ui';
import { clientUnits } from './economics';

/**
 * The decision box: the one thing a group must do in an open year (SPEC 8.3).
 *
 * The number is typed, nudged with the steppers or dragged on the slider, and
 * all three show the same value. Submitting always goes through a confirmation,
 * because 383 typed instead of 38.3 is the easiest mistake to make with a timer
 * running, and the group can change its mind until the year closes.
 */
export interface DecisionPanelProps {
  view: TeamView;
  send: SendCommand;
  /** Somewhere to put a short "Saved" or an error, usually a toast. */
  onSaid?: Say | undefined;
}

/** What the server would fill in if this group ran out of time. */
function autoFillTenths(view: TeamView): number {
  const previous = view.history[view.history.length - 1];
  return previous ? previous.ownTargetTenths : clientUnits(view.settings).startingOutputTenths;
}

function closedBecause(view: TeamView): string {
  if (view.phase === 'LOBBY' || view.phase === 'BRIEFING') {
    return 'The first year has not started yet. Your teacher will open it.';
  }
  if (view.phase === 'BETWEEN') {
    return 'This is talking time. You will type your number when the next year opens.';
  }
  if (view.phase === 'ENDED') return 'The game has finished, so there is nothing left to submit.';
  return 'This year is closed. Your teacher will start the next year.';
}

export function DecisionPanel({ view, send, onSaid }: DecisionPanelProps) {
  const open = OPEN_PHASES.includes(view.phase);
  const capacityTenths = view.settings.capacityTenths;
  const submitted = view.decision;

  const [text, setText] = useState(() =>
    submitted ? formatQuantity(submitted.tenths) : formatQuantity(autoFillTenths(view)),
  );
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
  const tenths = parsed.ok ? parsed.tenths : null;

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
      onSaid?.(`Submitted ${formatQuantity(asking)} million barrels.`, 'good');
    } else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  const showForm = editing || submitted === null;

  return (
    <section className="panel decision" aria-labelledby={`${fieldId}-heading`}>
      <h2 id={`${fieldId}-heading`}>Your decision</h2>

      {submitted !== null && (
        <p className="decision-state" role="status">
          {`Submitted ${formatQuantity(submitted.tenths)} million barrels`}
          {submitted.auto ? ' (filled in for you)' : ''}
          {submitted.byInstructor ? ' (set by your teacher)' : ''}
          {open ? ' - you can change it until the timer ends.' : '.'}
        </p>
      )}

      {!open && <p className="hint">{closedBecause(view)}</p>}

      {showForm ? (
        <>
          <NumberStepper
            id={fieldId}
            label={`How many million barrels will ${view.countryName} produce?`}
            value={text}
            onChange={(next) => {
              setText(next);
              setProblem(null);
            }}
            tenths={tenths}
            maxTenths={capacityTenths}
            disabled={!open || busy}
            describedBy={problem === null ? undefined : problemId}
            hint={`0 to ${formatQuantity(capacityTenths)} million barrels, one decimal place.`}
          />
          <Slider
            id={`${fieldId}-slider`}
            label="Or drag to the number you want"
            tenths={tenths ?? 0}
            maxTenths={capacityTenths}
            onChange={(next) => {
              setText(formatQuantity(next));
              setProblem(null);
            }}
            disabled={!open || busy}
          />
          {problem !== null && (
            <p className="problem" id={problemId} role="alert">
              {problem}
            </p>
          )}
          <div className="row">
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
          {open && submitted === null && (
            <p className="hint">
              {`If you send nothing, your country produces ${formatQuantity(autoFillTenths(view))} million barrels.`}
            </p>
          )}
        </>
      ) : (
        <Button
          tone="primary"
          size="large"
          onClick={() => {
            setEditing(true);
          }}
          disabled={!open}
        >
          Change
        </Button>
      )}

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
