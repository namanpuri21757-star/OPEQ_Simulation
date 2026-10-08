import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackFail, ackOk, type Ack } from '@shared/protocol';
import { PRESETS } from '@shared/settings';
import { instructorView } from '../../../tests/support/instructorView';
import { SetupScreen } from './SetupScreen';

function sender(ack: Ack = ackOk('cmd-1', 2)) {
  return vi.fn(() => Promise.resolve(ack));
}

function setup(ack?: Ack) {
  const send = sender(ack);
  const said = vi.fn();
  render(
    <MemoryRouter>
      <SetupScreen view={instructorView({ phase: 'LOBBY', year: 0 })} send={send} onSaid={said} />
    </MemoryRouter>,
  );
  return { send, said, user: userEvent.setup() };
}

const field = (label: string | RegExp) => screen.getByLabelText(label);

describe('the setup screen', () => {
  it('says what is wrong in the words validateSettings uses', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Highest price (a)'));
    await user.type(field('Highest price (a)'), '0.5');

    // The exact sentence comes from the shared schema, not from this screen.
    expect(
      await screen.findByText(
        'The highest price (a) must be more than the cost per barrel, or no one could ever profit. Right now a is 0.5 and cost is 1.',
      ),
    ).toBeInTheDocument();
  });

  it('refuses more than two decimal places on money, with an example', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Cost per barrel'));
    await user.type(field('Cost per barrel'), '1.234');

    expect(
      await screen.findByText('The cost per barrel can have at most 2 decimal places, like 70.25.'),
    ).toBeInTheDocument();
  });

  it('refuses more than one decimal place on a quantity', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Capacity'));
    await user.type(field('Capacity'), '75.25');

    expect(
      await screen.findByText('Capacity can have at most one decimal place, like 38.3.'),
    ).toBeInTheDocument();
  });

  it('says so when an activity is scheduled after the last year', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Scored years'));
    await user.type(field('Scored years'), '3');

    expect(
      await screen.findByText(
        'An activity has to come after a year that is still followed by another year. This game has 3 years, so choose a year from 1 to 2.',
      ),
    ).toBeInTheDocument();
  });

  it('holds the preview back while a box is not a number yet', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Slope (b)'));
    await user.type(field('Slope (b)'), 'nought point three');

    expect(
      await screen.findByText('That is not a number yet. Type digits, like 70 or 0.3.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The preview comes back as soon as every setting is a number the game can use.'),
    ).toBeInTheDocument();
  });

  it('keeps a half-typed decimal exactly as typed', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    await user.clear(field('Slope (b)'));
    await user.type(field('Slope (b)'), '0.');

    expect(field('Slope (b)')).toHaveValue('0.');
  });

  it('sends the whole settings object when it is saved', async () => {
    const { send, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(send).toHaveBeenCalledTimes(1);
    const [type, payload] = send.mock.calls[0] as unknown as [
      string,
      { settings: Record<string, unknown> },
    ];
    expect(type).toBe('updateSettings');
    expect(payload.settings).toMatchObject({ worlds: 3, a: 70, b: 0.3, years: 12 });
  });

  it('sends nothing, and says why, while a setting is still wrong', async () => {
    const { send, said, user } = setup();
    await user.click(screen.getByText('Advanced settings'));
    await user.clear(field('Capacity'));
    await user.type(field('Capacity'), '0');

    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(send).not.toHaveBeenCalled();
    expect(said).toHaveBeenCalledWith(
      'Some settings still need fixing. The messages are next to them.',
      'bad',
    );
  });

  it('shows the server’s own words when saving is refused', async () => {
    const { said, user } = setup(
      ackFail('cmd-1', 'NOT_ALLOWED', 'Settings can only be changed in the lobby.'),
    );
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(said).toHaveBeenCalledWith('Settings can only be changed in the lobby.', 'bad');
  });

  it('switches every number when a different preset is picked', async () => {
    const { user } = setup();
    await user.click(screen.getByLabelText(/short-50/));
    await user.click(screen.getByText('Advanced settings'));

    expect(field('Scored years')).toHaveValue(String(PRESETS['short-50'].years));
    expect(field('Practice year')).toHaveValue(String(PRESETS['short-50'].timers.practiceSeconds));
    // The number of worlds is the teacher's choice about the room, not the
    // preset's, so it survives.
    expect(field('Worlds')).toHaveValue('3');
  });

  it('gives the 25-student hint next to the worlds box', () => {
    setup();
    expect(
      screen.getByText(/With 25 students, 3 worlds gives 9 groups of 2 or 3/),
    ).toBeInTheDocument();
  });

  it('names every group from SPEC 8.4', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    for (const name of ['Market', 'Timing', 'Communication', 'Events', 'Display']) {
      expect(screen.getByRole('heading', { level: 3, name })).toBeInTheDocument();
    }
  });

  it('has no chat mode and no demand event to set', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    expect(screen.queryByLabelText(/When teams may send messages/)).toBeNull();
    expect(screen.queryByLabelText(/Demand changes/)).toBeNull();
    expect(screen.queryByLabelText(/What the news says/)).toBeNull();
  });

  it('adds and removes a messaging window', async () => {
    const { user } = setup();
    await user.click(screen.getByText('Advanced settings'));

    expect(screen.getAllByLabelText('What happens')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Add an activity' }));
    expect(screen.getAllByLabelText('What happens')).toHaveLength(4);

    await user.click(screen.getByRole('button', { name: 'Remove the chat window after year 3' }));
    expect(screen.getAllByLabelText('What happens')).toHaveLength(3);
  });
});
