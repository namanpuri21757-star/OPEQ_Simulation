import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackFail, ackOk, type Ack } from '@shared/protocol';
import { message, messaging, teamView, NOW } from '../../../tests/support/teamView';
import { MessagesPanel } from './MessagesPanel';

function sender(ack: Ack = ackOk('cmd-1', 9)) {
  return vi.fn(() => Promise.resolve(ack));
}

const serverNow = () => NOW;

/** Messaging on, with three minutes left. */
const on = () => teamView({ messaging: messaging({ on: true, until: NOW + 180_000 }) });

const BOX = 'Write to the other countries in your world';

describe('MessagesPanel', () => {
  it('says messaging is off, and offers nothing to type in', () => {
    render(<MessagesPanel view={teamView()} send={sender()} serverNow={serverNow} />);
    expect(screen.getByText('Messaging is off. Your teacher turns it on.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('says messaging is on, how long is left and who types', () => {
    render(<MessagesPanel view={on()} send={sender()} serverNow={serverNow} />);
    const line = screen.getByText(/Messaging is on/);
    expect(line).toHaveTextContent('Messaging is on');
    expect(line).toHaveTextContent('3:00');
    // The default team is Maya at the keyboard with Leo and Sam as Envoys.
    expect(line).toHaveTextContent('Leo and Sam (Envoy) types for your country.');
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('still shows what was said earlier while messaging is off', () => {
    render(
      <MessagesPanel
        view={teamView({
          messages: [
            message({ text: 'Shall we all produce 38.3?' }),
            message({
              messageId: 'm2',
              letter: 'C',
              countryName: 'Cendra',
              text: 'We will produce 38.3 million barrels.',
            }),
          ],
        })}
        send={sender()}
        serverNow={serverNow}
      />,
    );
    expect(screen.getByText('Shall we all produce 38.3?')).toBeInTheDocument();
    expect(screen.getByText('We will produce 38.3 million barrels.')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('sends a message and clears the box', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={on()} send={send} serverNow={serverNow} />);
    const box = screen.getByLabelText(BOX);

    await user.type(box, 'Shall we all produce 38.3?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(send).toHaveBeenCalledWith('sendMessage', { text: 'Shall we all produce 38.3?' });
    expect(box).toHaveValue('');
  });

  it('asks for a message before sending an empty one', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={on()} send={send} serverNow={serverNow} />);

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Type your message first.')).toBeInTheDocument();
  });

  it('passes the server’s own words on when a message is refused', async () => {
    const user = userEvent.setup();
    const send = sender(
      ackFail('cmd-1', 'RATE_LIMITED', 'One message every three seconds, please. Try again.'),
    );
    render(<MessagesPanel view={on()} send={send} serverNow={serverNow} />);

    await user.type(screen.getByLabelText(BOX), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      screen.getByText('One message every three seconds, please. Try again.'),
    ).toBeInTheDocument();
  });

  it('says a team has been muted, and keeps the list readable', () => {
    render(
      <MessagesPanel
        view={teamView({
          messaging: messaging({ on: true }),
          muted: true,
          messages: [message()],
        })}
        send={sender()}
        serverNow={serverNow}
      />,
    );
    expect(
      screen.getByText(
        'Your teacher has paused messages from your country. You can still read them.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Shall we all produce 38.3?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has no promise field, because a promise is a plain message now', () => {
    render(<MessagesPanel view={on()} send={sender()} serverNow={serverNow} />);
    expect(screen.queryByLabelText(/Promise a number/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /promise/i })).not.toBeInTheDocument();
  });
});
