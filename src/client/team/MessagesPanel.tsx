import { useId, useState } from 'react';
import { MAX_MESSAGE_CHARS } from '@shared/protocol';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { MessageView, TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Badge, Banner, Button, type Say } from '../ui';

/**
 * The world channel (SPEC section 6): the three countries in this world, and
 * announcements from the teacher. Never student names, only countries.
 *
 * Outside a chat window the panel is still here, read-only, so a group can look
 * back at what was promised. That matters: a pledge made in Year 3 is the thing
 * the reveal in Year 4 compares against.
 */
export interface MessagesPanelProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
}

/** "14:05" without asking the browser's language settings. */
export function clockTime(at: number): string {
  const when = new Date(at);
  const hours = String(when.getHours()).padStart(2, '0');
  const minutes = String(when.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function Line({ message, own }: { message: MessageView; own: boolean }) {
  const pledge = message.kind === 'pledge';
  return (
    <li className={`message${own ? ' message-own' : ''}`}>
      <span className="message-who">
        {message.letter === null ? (
          <strong>Your teacher</strong>
        ) : (
          <>
            <Badge letter={message.letter} size="small" />
            <strong>{message.countryName}</strong>
          </>
        )}
        {own && <span className="message-tag">you</span>}
        {pledge && <span className="message-tag">promise</span>}
      </span>
      <span className="message-text">{message.text}</span>
      <span className="message-time">{clockTime(message.at)}</span>
    </li>
  );
}

export function MessagesPanel({ view, send, onSaid }: MessagesPanelProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [pledge, setPledge] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canWrite = view.chatOpen;

  const sendChat = async () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setProblem('Type your message first.');
      return;
    }
    setBusy(true);
    const ack = await send('sendMessage', { text: trimmed });
    setBusy(false);
    if (ack.ok) {
      setText('');
      setProblem(null);
    } else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  const sendPledge = async () => {
    const parsed = parseQuantity(pledge, view.settings.capacityTenths);
    if (!parsed.ok) {
      setProblem(parsed.message);
      return;
    }
    setBusy(true);
    const ack = await send('sendPledge', { tenths: parsed.tenths });
    setBusy(false);
    if (ack.ok) {
      setPledge('');
      setProblem(null);
      onSaid?.('Your promise has been sent.', 'good');
    } else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  return (
    <section className="panel messages" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Messages</h2>

      {view.messages.length === 0 ? (
        <p className="hint">No messages yet.</p>
      ) : (
        <ul className="message-list">
          {view.messages.map((message) => (
            <Line key={message.messageId} message={message} own={message.letter === view.letter} />
          ))}
        </ul>
      )}

      {view.muted && (
        <Banner tone="warning" title="Paused">
          Your teacher has paused your messages for now. You can still read them.
        </Banner>
      )}

      {!canWrite ? (
        !view.muted && <p className="hint">Messages open when your teacher opens a chat window.</p>
      ) : (
        <>
          <p className="field">
            <label htmlFor={`${id}-text`}>Write to the other countries in your world</label>
            <textarea
              id={`${id}-text`}
              rows={3}
              maxLength={MAX_MESSAGE_CHARS}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(null);
              }}
            />
            <span className="hint" aria-live="polite">
              {`${String(text.length)} of ${String(MAX_MESSAGE_CHARS)} characters`}
            </span>
          </p>
          <Button tone="primary" onClick={() => void sendChat()} disabled={busy}>
            Send
          </Button>

          <p className="field pledge-field">
            <label htmlFor={`${id}-pledge`}>Promise a number (million barrels)</label>
            <input
              id={`${id}-pledge`}
              type="text"
              inputMode="decimal"
              value={pledge}
              onChange={(event) => {
                setPledge(event.target.value);
                setProblem(null);
              }}
            />
            <span className="hint">
              {pledge.trim() === ''
                ? 'This sends "We will produce X million barrels."'
                : `This sends "We will produce ${pledge.trim()} million barrels."`}
            </span>
          </p>
          <Button onClick={() => void sendPledge()} disabled={busy}>
            Send our promise
          </Button>
          <p className="hint">
            {`Your capacity is ${formatQuantity(view.settings.capacityTenths)} million barrels. Keep promises you mean to keep: the results screen shows what each country promised next to what it really produced.`}
          </p>
        </>
      )}

      {problem !== null && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
