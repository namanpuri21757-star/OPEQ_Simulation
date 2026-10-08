import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import { instructorView } from '../../../tests/support/instructorView';
import { NOW, message } from '../../../tests/support/teamView';
import { MessagingPanel } from './MessagingPanel';

/**
 * The messaging switch (SPEC 8.4).
 *
 * The thing this panel has to get right is that it can never be misread. Off
 * says OFF in letters, on says ON, and the command it sends is the same command
 * the plan's next step sends.
 */
function sender(ack: Ack = ackOk('cmd-1', 3)) {
  return vi.fn(() => Promise.resolve(ack));
}

function show(over: Parameters<typeof instructorView>[0] = {}) {
  const send = sender();
  const said = vi.fn();
  render(
    <MessagingPanel
      view={instructorView(over)}
      send={send}
      onSaid={said}
      serverNow={() => NOW}
    />,
  );
  return { send, said, user: userEvent.setup() };
}

/** Messaging on in every world, with three minutes left. */
const allOn = (until: number | null = NOW + 180_000) => ({
  messaging: [1, 2, 3].map((worldNumber) => ({
    worldId: `world-${String(worldNumber)}`,
    worldNumber,
    on: true,
    until,
  })),
});

describe('the messaging switch', () => {
  it('says OFF in letters, and explains itself in one line', () => {
    show();
    expect(screen.getByText('OFF')).toBeInTheDocument();
    expect(screen.getByText('OFF').className).toContain('switch-off');
    // Named next to the switch, and read out as a status for a screen reader.
    expect(screen.getByRole('status')).toHaveTextContent('Messaging is off.');
    expect(
      screen.getByText(
        'When on, each country can send messages to the other two countries in its world. You see every message.',
      ),
    ).toBeInTheDocument();
  });

  it('asks how long and which worlds before turning it on', async () => {
    const { send, user } = show();
    await user.click(screen.getByRole('button', { name: /Turn messaging on/ }));

    expect(screen.getByRole('group', { name: 'How long?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Which worlds?' })).toBeInTheDocument();
    // Nothing is sent until the teacher presses the one primary button.
    expect(send).not.toHaveBeenCalled();
  });

  it('defaults to four minutes and every world', async () => {
    const { send, user } = show();
    await user.click(screen.getByRole('button', { name: /Turn messaging on/ }));
    await user.click(screen.getByRole('button', { name: 'Turn messaging on for 4 minutes' }));

    expect(send).toHaveBeenCalledWith('setMessaging', { on: true, seconds: 240 });
  });

  it('can stay on until the teacher turns it off', async () => {
    const { send, user } = show();
    await user.click(screen.getByRole('button', { name: /Turn messaging on/ }));
    await user.click(screen.getByLabelText('Until I turn it off'));
    await user.click(
      screen.getByRole('button', { name: 'Turn messaging on until I turn it off' }),
    );

    expect(send).toHaveBeenCalledWith('setMessaging', { on: true });
  });

  it('names the worlds when the teacher picks some of them', async () => {
    const { send, user } = show();
    await user.click(screen.getByRole('button', { name: /Turn messaging on/ }));

    const worlds = screen.getByRole('group', { name: 'Which worlds?' });
    await user.click(within(worlds).getByLabelText('World 2'));
    await user.click(screen.getByRole('button', { name: /Turn messaging on for 4 minutes/ }));

    expect(send).toHaveBeenCalledWith('setMessaging', {
      on: true,
      worldIds: ['world-1', 'world-3'],
      seconds: 240,
    });
  });

  it('says ON, shows a countdown per world and offers one way out', () => {
    show(allOn());
    expect(screen.getByText('ON')).toBeInTheDocument();
    const clocks = screen.getByLabelText('Time left in each world');
    expect(within(clocks).getAllByText('3:00')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Turn off now' })).toBeInTheDocument();
    // There is nothing to set while it is on.
    expect(screen.queryByRole('group', { name: 'How long?' })).toBeNull();
  });

  it('says so in words when a window has no end time', () => {
    show(allOn(null));
    expect(screen.getAllByText('until you turn it off')).toHaveLength(3);
  });

  it('turns it off for every world at once', async () => {
    const { send, user } = show(allOn());
    await user.click(screen.getByRole('button', { name: 'Turn off now' }));
    expect(send).toHaveBeenCalledWith('setMessaging', { on: false });
  });

  it('shows the feed for the world whose tab is chosen', async () => {
    const { user } = show({
      messagesByWorld: {
        'world-1': [message({ text: 'World one is talking.' })],
        'world-2': [message({ messageId: 'm2', text: 'World two is talking.' })],
        'world-3': [],
      },
    });

    expect(screen.getByText('World one is talking.')).toBeInTheDocument();
    expect(screen.queryByText('World two is talking.')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'World 2' }));
    expect(screen.getByText('World two is talking.')).toBeInTheDocument();
    expect(screen.queryByText('World one is talking.')).toBeNull();
  });
});
