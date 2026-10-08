import { useState, type ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

/**
 * The one question asked before anything irreversible happens (SPEC 8.4).
 *
 * Two strengths. Closing a year or ending a game asks once, because a teacher
 * does both on purpose several times a lesson. Resetting or deleting asks for
 * the word to be typed, because those throw away a class's work and a
 * mis-aimed click must not be enough.
 *
 * Never a browser alert: a browser dialog freezes the countdown and the live
 * region behind it, and the teacher is usually mid-sentence with the room.
 */
export interface ConfirmProps {
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  /** The word that has to be typed, for a reset or a delete. */
  typed?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm(): void;
  onCancel(): void;
  /** Set while the command is in flight, so it cannot be sent twice. */
  busy?: boolean;
}

export function Confirm({
  title,
  children,
  typed,
  confirmLabel,
  cancelLabel = 'No, go back',
  onConfirm,
  onCancel,
  busy = false,
}: ConfirmProps) {
  const [word, setWord] = useState('');
  const ready = typed === undefined || word.trim().toUpperCase() === typed;

  return (
    <Dialog
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button tone="primary" onClick={onConfirm} disabled={busy || !ready}>
            {confirmLabel}
          </Button>
          <Button onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
        </>
      }
    >
      {children}
      {typed !== undefined && (
        <div className="field">
          <label className="field-label" htmlFor="confirm-word">
            {`Type ${typed} to continue`}
          </label>
          <input
            id="confirm-word"
            className="input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={word}
            onChange={(event) => setWord(event.target.value)}
          />
        </div>
      )}
    </Dialog>
  );
}
