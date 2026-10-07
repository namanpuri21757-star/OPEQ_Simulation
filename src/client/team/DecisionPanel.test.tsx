import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackFail, ackOk, type Ack } from '@shared/protocol';
import { teamView } from '../../../tests/support/teamView';
import { DecisionPanel } from './DecisionPanel';

function sender(ack: Ack = ackOk('cmd-1', 8)) {
  return vi.fn(() => Promise.resolve(ack));
}

const field = () => screen.getByLabelText('How many million barrels will Borvia produce?');

describe('DecisionPanel', () => {
  it('names the problem when the number has too many decimals', async () => {
    const user = userEvent.setup();
    render(<DecisionPanel view={teamView()} send={sender()} />);

    await user.clear(field());
    await user.type(field(), '38.35');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(
      screen.getByText('Only one decimal place is allowed. Try 38.3 or 38.4 instead of 38.35.'),
    ).toBeInTheDocument();
  });

  it('says so when the number is over capacity', async () => {
    const user = userEvent.setup();
    render(<DecisionPanel view={teamView()} send={sender()} />);

    await user.clear(field());
    await user.type(field(), '80');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText(/Your capacity is 75.0 million barrels/)).toBeInTheDocument();
  });

  it('asks for words it cannot read as a number', async () => {
    const user = userEvent.setup();
    render(<DecisionPanel view={teamView()} send={sender()} />);

    await user.clear(field());
    await user.type(field(), 'forty');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('That is not a number. Type digits only, like 38.3.')).toBeVisible();
  });

  it('confirms before submitting, then shows the submitted state with Change', async () => {
    const user = userEvent.setup();
    const send = sender();
    const view = teamView();
    const { rerender } = render(<DecisionPanel view={view} send={send} />);

    await user.clear(field());
    await user.type(field(), '38.3');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    // Nothing has been sent while the question is on screen.
    const dialog = screen.getByRole('dialog', {
      name: 'Submit 38.3 million barrels for Year 5?',
    });
    expect(send).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, submit' }));
    expect(send).toHaveBeenCalledWith('submitDecision', { tenths: 383 });
    expect(dialog).not.toBeInTheDocument();

    // The server's answer comes back as a new view, which is what tells the
    // panel it is submitted.
    rerender(
      <DecisionPanel
        view={teamView({
          decision: { tenths: 383, auto: false, at: 1, byInstructor: false },
          submitted: true,
        })}
        send={send}
      />,
    );

    expect(
      screen.getByText('Submitted 38.3 million barrels - you can change it until the timer ends.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/How many million barrels/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Change' }));
    expect(field()).toHaveValue('38.3');
  });

  it('sends nothing when the group backs out of the confirmation', async () => {
    const user = userEvent.setup();
    const send = sender();
    render(<DecisionPanel view={teamView()} send={send} />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'No, go back' }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the server’s own words when a submission is refused', async () => {
    const user = userEvent.setup();
    const send = sender(
      ackFail('cmd-1', 'CLOSED', 'That year has closed. Your last number counts.'),
    );
    render(<DecisionPanel view={teamView()} send={send} />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await user.click(screen.getByRole('button', { name: 'Yes, submit' }));

    expect(screen.getByText('That year has closed. Your last number counts.')).toBeInTheDocument();
  });

  it('is disabled with an explanation when the year is closed', () => {
    render(<DecisionPanel view={teamView({ phase: 'YEAR_REVEAL' })} send={sender()} />);

    expect(field()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
    expect(
      screen.getByText('This year is closed. Your teacher will start the next year.'),
    ).toBeInTheDocument();
  });

  it('tells a group what will happen if it sends nothing', () => {
    render(<DecisionPanel view={teamView({ history: [] })} send={sender()} />);
    expect(
      screen.getByText('If you send nothing, your country produces 40.0 million barrels.'),
    ).toBeInTheDocument();
  });
});
