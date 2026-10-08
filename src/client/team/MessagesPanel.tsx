import { useId, useState } from 'react';
import { MAX_MESSAGE_CHARS } from '@shared/protocol';
import { envoyNames } from '@shared/roles';
import type { MessageView, TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Badge, Button, Countdown, type Say } from '../ui';

/**
 * The world channel (SPEC section 6): the three countries in this world, and
 * nobody else.
 *
 * Its first line always says what state it is in, because "why can't we type?"
 * was the question this panel kept being asked. When messaging is off there is
 * no input at all, so there is nothing to try and nothing to be refused by.
 *
 * The list stays readable when messaging is off: a promise made in Year 3 is
 * exactly what a group wants to look back at in Year 4.
 */
export interface MessagesPanelProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
  serverNow?: (() => number) | undefined;
}

/** "14:05" without asking the browser's language settings. */
export function clockTime(at: number): string {
  const when = new Date(at);
  const hours = String(when.getHours()).padStart(2, '0');
  const minutes = String(when.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function Line({ message, own }: { message: MessageView; own: boolean }) {
  return (
    <li className={`message${own ? ' message-mine' : ''}`}>
      <span className="message-who">
        <Badge letter={message.letter} size="small" />
        {message.countryName}
      </span>{' '}
      <span className="num" aria-hidden="true">
        {clockTime(message.at)}
      </span>
      <br />
      <span className="message-text">{message.text}</span>
    </li>
  );
}

export function MessagesPanel({ view, send, onSaid, serverNow }: MessagesPanelProps) {
  const id = useId();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const on = view.messaging.on && !view.muted;
  const envoy = envoyNames(view.roles);

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

  return (
    <section className="box" aria-labelledby={`${id}-heading`}>
      <h2 className="visually-hidden" id={`${id}-heading`}>
        Messages
      </h2>

      {/* The first line is the state, every time. */}
      {view.muted ? (
        <p className="messages-state messages-off" role="status">
          Your teacher has paused messages from your country. You can still read them.
        </p>
      ) : on ? (
        <p className="messages-state" role="status">
          Messaging is on
          {view.messaging.until !== null && serverNow !== undefined && (
            <>
              {': '}
              <Countdown
                deadline={view.messaging.until}
                remainingMs={null}
                paused={false}
                serverNow={serverNow}
                closedLabel="0:00"
              />
              {' left'}
            </>
          )}
          {envoy === '' ? '.' : `. ${envoy} (Envoy) types for your country.`}
        </p>
      ) : (
        <p className="messages-state messages-off" role="status">
          Messaging is off. Your teacher turns it on.
        </p>
      )}

      {view.messages.length > 0 && (
        <ul className="message-list" tabIndex={0} aria-label="Messages in your world">
          {view.messages.map((message) => (
            <Line key={message.messageId} message={message} own={message.letter === view.letter} />
          ))}
        </ul>
      )}

      {on && (
        <div className="message-form">
          <label className="visually-hidden" htmlFor={`${id}-text`}>
            Write to the other countries in your world
          </label>
          <input
            id={`${id}-text`}
            className="input"
            type="text"
            maxLength={MAX_MESSAGE_CHARS}
            autoComplete="off"
            value={text}
            placeholder="Write to the other two countries"
            onChange={(event) => {
              setText(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void sendChat();
            }}
          />
          <Button onClick={() => void sendChat()} disabled={busy}>
            Send
          </Button>
        </div>
      )}

      {problem !== null && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
