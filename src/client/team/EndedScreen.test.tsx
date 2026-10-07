import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { leaderboard, teamView, yearRow } from '../../../tests/support/teamView';
import { EndedScreen } from './EndedScreen';

/**
 * The team's end screen (SPEC 8.3 End).
 *
 * The rule that matters most here is the one about other worlds: a group sees
 * its own summary the moment the game ends, and the world chart and the
 * leaderboard only after the teacher releases the results. The screen cannot
 * leak them because the view does not carry them, and this test is what keeps
 * that true as the screen grows.
 */
const history = [yearRow(1), yearRow(2), yearRow(3)];

function ok() {
  return vi.fn().mockResolvedValue({ ok: true, commandId: 'c1', version: 1 });
}

describe('before the teacher releases the results', () => {
  const view = teamView({ phase: 'ENDED', history, resultsRevealed: false, leaderboard: null });

  it('shows the group its own total and the three questions', () => {
    render(<EndedScreen view={view} send={ok()} />);
    expect(screen.getByRole('heading', { name: 'The game has finished' })).toBeInTheDocument();
    expect(screen.getByText(/Borvia earned/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Three questions' })).toBeInTheDocument();
  });

  it('shows no other world and no leaderboard', () => {
    render(<EndedScreen view={view} send={ok()} />);
    expect(screen.queryByRole('heading', { name: /Every country in the class/ })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Your world, year by year/ })).toBeNull();
    expect(screen.queryByText(/World 1/)).toBeNull();
  });

  it('saves the three answers', async () => {
    const send = ok();
    render(<EndedScreen view={view} send={send} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/When did your world cooperate best/), 'Years 1 to 3.');
    await user.click(screen.getByRole('button', { name: /Save our answers/ }));
    expect(send).toHaveBeenCalledWith('submitReflection', {
      answers: ['Years 1 to 3.', '', ''],
    });
  });
});

describe('after the teacher releases the results', () => {
  const view = teamView({
    phase: 'ENDED',
    history,
    resultsRevealed: true,
    leaderboard: leaderboard({
      countries: [
        {
          worldNumber: 1,
          letter: 'A',
          countryName: 'Ardonia',
          label: 'World 1 - Ardonia (A)',
          cumulativeProfitK: 6_000_000,
        },
        {
          worldNumber: 2,
          letter: 'B',
          countryName: 'Borvia',
          label: 'World 2 - Borvia (B)',
          cumulativeProfitK: 5_000_000,
        },
      ],
      worlds: [
        { worldNumber: 1, totalProfitK: 14_000_000, cooperativeMaxK: 15_000_000 },
        { worldNumber: 2, totalProfitK: 12_000_000, cooperativeMaxK: 15_000_000 },
      ],
    }),
  });

  it('shows the group its own world chart', () => {
    render(<EndedScreen view={view} send={ok()} />);
    expect(screen.getByRole('heading', { name: /Your world, year by year/ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Output by country/ })).toBeInTheDocument();
  });

  it('shows the whole class, with each world as a share of the best possible', () => {
    render(<EndedScreen view={view} send={ok()} />);
    const worlds = screen.getByRole('table', { name: /Each world together/ });
    expect(worlds.textContent).toContain('93%');
    expect(worlds.textContent).toContain('80%');
    expect(screen.getByRole('table', { name: /Total profit, every world/ }).textContent).toContain(
      'World 1 - Ardonia (A)',
    );
  });
});
