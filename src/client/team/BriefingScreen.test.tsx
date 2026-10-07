import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { publicSettings, teamView } from '../../../tests/support/teamView';
import { BriefingScreen } from './BriefingScreen';

describe('BriefingScreen', () => {
  it('follows the slide the instructor is on', () => {
    const { rerender } = render(<BriefingScreen view={teamView({ phase: 'BRIEFING' })} />);
    expect(screen.getByText('Briefing, screen 1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'You run an oil country' })).toBeInTheDocument();

    rerender(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 2 })} />);
    expect(screen.getByRole('heading', { name: 'Who does what' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'You run an oil country' })).toBeNull();
  });

  it('works the example out from this session’s own numbers', () => {
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 1 })} />);
    expect(
      screen.getByText(
        'If the world produces 120.0 million barrels, the price is $70.00 - $0.3 x 120.0 = $34.00 a barrel.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'If you produced 40.0 million barrels, your profit is ($34.00 - $1.00) x 40.0 = $1,320.00M.',
      ),
    ).toBeInTheDocument();
  });

  it('follows changed settings rather than the defaults', () => {
    render(
      <BriefingScreen
        view={teamView({
          phase: 'BRIEFING',
          briefingSlide: 1,
          settings: publicSettings({ a: 60, b: 0.2, cost: 2, startingOutput: 50 }),
        })}
      />,
    );
    // 60 - 0.2 x 150 = 30, and (30 - 2) x 50 = 1,400.
    expect(
      screen.getByText(
        'If the world produces 150.0 million barrels, the price is $60.00 - $0.2 x 150.0 = $30.00 a barrel.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/= \$1,400.00M\./)).toBeInTheDocument();
  });

  it('shows the quick check on the last slide only', () => {
    const { rerender } = render(
      <BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 2 })} />,
    );
    expect(screen.queryByRole('heading', { name: 'Quick check' })).toBeNull();

    rerender(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 3 })} />);
    expect(screen.getByRole('heading', { name: 'Quick check' })).toBeInTheDocument();
  });

  it('answers the three questions kindly, right or wrong', async () => {
    const user = userEvent.setup();
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 3 })} />);

    const questions = screen.getAllByRole('group');
    expect(questions).toHaveLength(3);

    // Question 1: the price when the world produces 120.0 million barrels.
    await user.click(screen.getByRole('button', { name: '$34.00' }));
    expect(screen.getByText(/^Yes, that is right\./)).toBeInTheDocument();
    expect(screen.getByText(/\$70.00 - \$0.3 x 120.0 = \$34.00\./)).toBeInTheDocument();

    // Wrong answers explain the same thing instead of scoring it.
    await user.click(screen.getByRole('button', { name: '$70.00' }));
    expect(screen.getByText(/^Not quite - have another go\./)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '$1,320.00M' }));
    await user.click(screen.getByRole('button', { name: 'It goes down.' }));
    expect(screen.getAllByText(/^Yes, that is right\./)).toHaveLength(2);
  });
});
