import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MAX_MESSAGE_CHARS, ackFail, ackOk, type Ack } from '@shared/protocol';
import { message, teamView } from '../../../tests/support/teamView';
import { MessagesPanel } from './MessagesPanel';

function sender(ack: Ack = ackOk('cmd-1', 9)) {
  return vi.fn(() => Promise.resolve(ack));
}

const open = () => teamView({ phase: 'BETWEEN', chatOpen: true });

describe('MessagesPanel', () => {
  it('is read-only until a chat window opens', () => {
    render(<MessagesPanel view={teamView()} send={sender()} />);
    expect(
      screen.getByText('Messages open when your teacher opens a chat window.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('still shows what was said earlier while it is read-only', () => {
    render(
      <MessagesPanel
        view={teamView({
          messages: [
            message({ text: 'Shall we all produce 38.3?' }),
            message({
              messageId: 'm2',
              kind: 'pledge',
              letter: 'C',
              countryName: 'Cendra',
              text: 'We will produce 38.3 million barrels.',
              tenths: 383,
            }),
          ],
        })}
        send={sender()}
      />,
    );
    expect(screen.getByText('Shall we all produce 38.3?')).toBeInTheDocument();
    expect(screen.getByText('We will produce 38.3 million barrels.')).toBeInTheDocument();
    expect(screen.getAllByText('promise')).toHaveLength(1);
  });

  it('counts the characters and stops at the limit', async () => {
    const user = userEvent.setup();
    render(<MessagesPanel view={open()} send={sender()} />);
    const box = screen.getByLabelText('Write to the other countries in your world');

    expect(screen.getByText(`0 of ${String(MAX_MESSAGE_CHARS)} characters`)).toBeInTheDocument();
    expect(box).toHaveAttribute('maxlength', String(MAX_MESSAGE_CHARS));

    await user.type(box, 'Hello');
    expect(screen.getByText(`5 of ${String(MAX_MESSAGE_CHARS)} characters`)).toBeInTheDocument();
  });

  it('sends a message and clears the box', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={open()} send={send} />);
    const box = screen.getByLabelText('Write to the other countries in your world');

    await user.type(box, 'Shall we all produce 38.3?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(send).toHaveBeenCalledWith('sendMessage', { text: 'Shall we all produce 38.3?' });
    expect(box).toHaveValue('');
  });

  it('asks for a message before sending an empty one', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={open()} send={send} />);

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Type your message first.')).toBeInTheDocument();
  });

  it('shows the sentence a promise will send, then sends it in tenths', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={open()} send={send} />);

    await user.type(screen.getByLabelText('Promise a number (million barrels)'), '38.3');
    expect(
      screen.getByText('This sends "We will produce 38.3 million barrels."'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Send our promise' }));
    expect(send).toHaveBeenCalledWith('sendPledge', { tenths: 383 });
  });

  it('refuses a promise it cannot read as a number', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<MessagesPanel view={open()} send={send} />);

    await user.type(screen.getByLabelText('Promise a number (million barrels)'), '38.35');
    await user.click(screen.getByRole('button', { name: 'Send our promise' }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText(/Only one decimal place is allowed/)).toBeInTheDocument();
  });

  it('passes the server’s own words on when a message is refused', async () => {
    const user = userEvent.setup();
    const send = sender(
      ackFail('cmd-1', 'RATE_LIMITED', 'One message every three seconds, please. Try again.'),
    );
    render(<MessagesPanel view={open()} send={send} />);

    await user.type(screen.getByLabelText('Write to the other countries in your world'), 'Hi');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      screen.getByText('One message every three seconds, please. Try again.'),
    ).toBeInTheDocument();
  });

  it('says a team has been muted, and keeps the list readable', () => {
    render(
      <MessagesPanel
        view={teamView({ phase: 'BETWEEN', chatOpen: false, muted: true, messages: [message()] })}
        send={sender()}
      />,
    );
    expect(
      screen.getByText('Your teacher has paused your messages for now. You can still read them.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Shall we all produce 38.3?')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
