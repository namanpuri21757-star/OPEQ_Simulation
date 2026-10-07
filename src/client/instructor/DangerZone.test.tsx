import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import { instructorView } from '../../../tests/support/instructorView';
import { DangerZone } from './DangerZone';

function sender(ack: Ack = ackOk('cmd-1', 20)) {
  return vi.fn(() => Promise.resolve(ack));
}

async function open(which: 'Play again with this class' | 'Delete this game’s data') {
  const send = sender();
  const said = vi.fn();
  const onDeleted = vi.fn();
  render(<DangerZone view={instructorView()} send={send} onSaid={said} onDeleted={onDeleted} />);
  const user = userEvent.setup();
  await user.click(screen.getByText('Start over, or clear up'));
  await user.click(screen.getByRole('button', { name: which }));
  return { send, said, onDeleted, user };
}

function callOf(send: ReturnType<typeof sender>) {
  return send.mock.calls[0] as unknown as [string, Record<string, unknown>];
}

describe('resetting the game', () => {
  it('will not go through until RESET is typed', async () => {
    const { send, user } = await open('Play again with this class');

    expect(screen.getByRole('button', { name: 'Reset the game' })).toBeDisabled();

    await user.type(screen.getByLabelText('Type RESET to continue'), 'RESET');
    expect(screen.getByRole('button', { name: 'Reset the game' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Reset the game' }));
    expect(callOf(send)).toEqual(['resetSession', { confirm: 'RESET' }]);
  });

  it('says what a reset keeps, so it cannot be mistaken for a delete', async () => {
    await open('Play again with this class');
    expect(
      screen.getByText(
        /The teams keep their join codes, their names and the computers they are on/,
      ),
    ).toBeInTheDocument();
  });

  it('sends nothing when the wrong word is typed', async () => {
    const { send, user } = await open('Play again with this class');
    await user.type(screen.getByLabelText('Type RESET to continue'), 'DELETE');

    expect(screen.getByRole('button', { name: 'Reset the game' })).toBeDisabled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('deleting the data', () => {
  it('will not go through until DELETE is typed, then forgets the session', async () => {
    const { send, onDeleted, user } = await open('Delete this game’s data');

    expect(screen.getByRole('button', { name: 'Delete it' })).toBeDisabled();

    await user.type(screen.getByLabelText('Type DELETE to continue'), 'delete');
    await user.click(screen.getByRole('button', { name: 'Delete it' }));

    expect(callOf(send)).toEqual(['deleteSession', { confirm: 'DELETE' }]);
    expect(onDeleted).toHaveBeenCalled();
  });

  it('names the session and warns about the reflections', async () => {
    await open('Delete this game’s data');
    expect(
      screen.getByText(/session-demo is removed from this computer, including the reflections/),
    ).toBeInTheDocument();
  });

  it('sends nothing when the teacher backs out', async () => {
    const { send, onDeleted, user } = await open('Delete this game’s data');
    await user.click(screen.getByRole('button', { name: 'No, go back' }));

    expect(send).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
