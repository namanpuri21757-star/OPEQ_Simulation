import { useState } from 'react';
import { MAX_HUDDLE_REASON_CHARS } from '@shared/protocol';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { InstructorTeamView, InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, Dialog, type Say } from '../ui';
import { guardsFor } from './commands';

/**
 * Changing a team's number for them (SPEC 8.4).
 *
 * It needs a reason, and the reason is saved with the change, because this is the
 * one control that overrules a group's own decision. A teacher does it when a
 * terminal has died or a group has typed a number it did not mean; either way the
 * debrief has to be able to say why that year looks odd.
 *
 * The number goes through the same parser the team terminal uses, so a teacher in
 * a hurry gets the same plain message a student would.
 */
export interface OverrideDialogProps {
  view: InstructorView;
  team: InstructorTeamView;
  send: SendCommand;
  onSaid: Say;
  onClose(): void;
}

export function OverrideDialog({ view, team, send, onSaid, onClose }: OverrideDialogProps) {
  const [text, setText] = useState(() =>
    team.decision === null ? '' : formatQuantity(team.decision.tenths),
  );
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = parseQuantity(text, view.settings.capacity * 10);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    if (reason.trim() === '') {
      setProblem('Please say why you are changing it. The reason is saved with the change.');
      return;
    }

    setBusy(true);
    const ack = await send(
      'overrideDecision',
      { teamId: team.teamId, tenths: parsed.tenths, reason: reason.trim() },
      guardsFor(view),
    );
    setBusy(false);
    if (ack.ok) {
      onSaid(`${team.label} is now producing ${formatQuantity(parsed.tenths)}.`, 'good');
      onClose();
    } else {
      setProblem(ack.message);
    }
  };

  return (
    <Dialog
      title={`Change the number for ${team.label}`}
      onClose={onClose}
      footer={
        <>
          <Button tone="primary" onClick={() => void submit()} disabled={busy}>
            Change it
          </Button>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </>
      }
    >
      <p className="field">
        <label htmlFor="override-tenths">How many million barrels?</label>
        <input
          id="override-tenths"
          className="field-number"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setProblem(null);
          }}
        />
        <span className="hint">
          {team.decision === null
            ? 'This country has not submitted yet.'
            : `It submitted ${formatQuantity(team.decision.tenths)}.`}
        </span>
      </p>

      <p className="field">
        <label htmlFor="override-reason">Why are you changing it?</label>
        <input
          id="override-reason"
          type="text"
          maxLength={MAX_HUDDLE_REASON_CHARS}
          autoComplete="off"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setProblem(null);
          }}
        />
        <span className="hint">Saved with the change, for the debrief. Required.</span>
      </p>

      {problem !== null && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </Dialog>
  );
}
