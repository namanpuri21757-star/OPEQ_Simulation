import { useState } from 'react';
import type { InstructorView, SuggestedAction } from '@shared/views';
import type { ConnectionStatus, SendCommand } from '../net';
import { Confirm, Toast, useToast } from '../ui';
import { LiveScreen } from './LiveScreen';
import { StartScreen } from './StartScreen';
import { explainStep } from './NextStep';
import { looseSend } from './commands';
import type { CommandType } from '@shared/protocol';

/**
 * The teacher has two screens, and which one they are on is not a choice they
 * make: before the briefing it is the start page, and from the briefing on it is
 * the live page (SPEC 8.4).
 *
 * Splitting them is the main structural change in v2. One screen that had to be
 * both a setup form and a live dashboard meant that at any moment half of it was
 * about something else.
 */
export interface DashboardProps {
  view: InstructorView;
  send: SendCommand;
  status: ConnectionStatus;
  serverNow(): number;
  /** Called after the session is deleted, so the screen forgets it. */
  onDeleted(): void;
}

export function Dashboard({ view, send, status, serverNow, onDeleted }: DashboardProps) {
  const { message, say } = useToast();
  const [asking, setAsking] = useState<SuggestedAction | null>(null);
  const [busy, setBusy] = useState(false);

  if (view.phase !== 'LOBBY') {
    return (
      <LiveScreen
        view={view}
        send={send}
        status={status}
        serverNow={serverNow}
        onDeleted={onDeleted}
      />
    );
  }

  const suggested = view.suggested;

  const start = async (action: SuggestedAction) => {
    if (action.command === null) return;
    setBusy(true);
    const ack = await looseSend(send)(action.command as CommandType, action.payload, {
      expectedPhase: action.expectedPhase,
      expectedYear: action.expectedYear,
    });
    setBusy(false);
    say(ack.ok ? `Done: ${action.label}.` : ack.message, ack.ok ? 'good' : 'bad');
  };

  return (
    <>
      <StartScreen
        view={view}
        send={send}
        onSaid={say}
        onStart={() => {
          if (suggested.command !== null) setAsking(suggested);
        }}
      />

      {asking !== null && (
        <Confirm
          title="Start the briefing?"
          confirmLabel="Yes, start"
          busy={busy}
          onCancel={() => setAsking(null)}
          onConfirm={() => {
            const action = asking;
            setAsking(null);
            void start(action);
          }}
        >
          <p>{explainStep(asking, view)}</p>
          <p>Any group that has not joined yet can still join later.</p>
        </Confirm>
      )}

      <Toast message={message} />
    </>
  );
}
