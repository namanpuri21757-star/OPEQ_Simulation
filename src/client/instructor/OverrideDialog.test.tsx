import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackFail, ackOk, type Ack } from '@shared/protocol';
import { instructorTeam, instructorView } from '../../../tests/support/instructorView';
import { NOW } from '../../../tests/support/teamView';
import { OverrideDialog } from './OverrideDialog';

function sender(ack: Ack = ackOk('cmd-1', 14)) {
  return vi.fn(() => Promise.resolve(ack));
}

function renderDialog(
  team = instructorTeam(1, 'B', {
    decision: { tenths: 383, auto: false, source: 'team', at: NOW },
  }),
  ack?: Ack,
) {
  const send = sender(ack);
  const said = vi.fn();
  const onClose = vi.fn();
  render(
    <OverrideDialog
      view={instructorView({ worldCount: 1, teams: [team] })}
      team={team}
      send={send}
      onSaid={said}
      onClose={onClose}
    />,
  );
  return { send, said, onClose, user: userEvent.setup() };
}

const number = () => screen.getByLabelText('How many million barrels?');
const reason = () => screen.getByLabelText('Why are you changing it?');

describe('changing a team’s number', () => {
  it('opens on the number the team submitted', () => {
    renderDialog();
    expect(number()).toHaveValue('38.3');
    expect(screen.getByText('It submitted 38.3.')).toBeInTheDocument();
  });

  it('refuses to send without a reason, and says why', async () => {
    const { send, user } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Change it' }));

    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByText('Please say why you are changing it. The reason is saved with the change.'),
    ).toBeInTheDocument();
  });

  it('sends the number, the reason and the guards', async () => {
    const { send, onClose, user } = renderDialog();

    await user.clear(number());
    await user.type(number(), '42.5');
    await user.type(reason(), 'Their laptop died mid-year.');
    await user.click(screen.getByRole('button', { name: 'Change it' }));

    const [type, payload, options] = send.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(type).toBe('overrideDecision');
    expect(payload).toEqual({
      teamId: 'world-1-B',
      tenths: 425,
      reason: 'Their laptop died mid-year.',
    });
    expect(options).toEqual({ expectedPhase: 'YEAR_OPEN', expectedYear: 5 });
    expect(onClose).toHaveBeenCalled();
  });

  it('uses the same plain message a student would get for a bad number', async () => {
    const { send, user } = renderDialog();

    await user.clear(number());
    await user.type(number(), '38.35');
    await user.type(reason(), 'Typo.');
    await user.click(screen.getByRole('button', { name: 'Change it' }));

    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByText('Only one decimal place is allowed. Try 38.3 or 38.4 instead of 38.35.'),
    ).toBeInTheDocument();
  });

  it('says so when the number is over capacity', async () => {
    const { user } = renderDialog();

    await user.clear(number());
    await user.type(number(), '90');
    await user.type(reason(), 'Testing.');
    await user.click(screen.getByRole('button', { name: 'Change it' }));

    expect(screen.getByText(/Your capacity is 75.0 million barrels/)).toBeInTheDocument();
  });

  it('starts empty, and says so, for a team that has not submitted', () => {
    renderDialog(instructorTeam(1, 'B'));
    expect(number()).toHaveValue('');
    expect(screen.getByText('This country has not submitted yet.')).toBeInTheDocument();
  });

  it('stays open and shows the server’s words when the change is refused', async () => {
    const { onClose, user } = renderDialog(
      instructorTeam(1, 'B', { decision: { tenths: 383, auto: false, source: 'team', at: NOW } }),
      ackFail('cmd-1', 'STALE', 'The game has moved on to the next year.'),
    );

    await user.type(reason(), 'Late fix.');
    await user.click(screen.getByRole('button', { name: 'Change it' }));

    expect(screen.getByText('The game has moved on to the next year.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
