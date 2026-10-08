import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { publicSettings, teamView } from '../../../tests/support/teamView';
import { BriefingScreen } from './BriefingScreen';

describe('BriefingScreen', () => {
  it('follows the slide the instructor is on', () => {
    const { rerender } = render(<BriefingScreen view={teamView({ phase: 'BRIEFING' })} />);
    expect(screen.getByText('Briefing · Screen 1 of 4')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'You run an oil country' })).toBeInTheDocument();

    rerender(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 2 })} />);
    expect(screen.getByRole('heading', { name: 'Who does what' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'You run an oil country' })).toBeNull();
  });

  it('says the teacher moves the screens on, so nobody looks for a button', () => {
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING' })} />);
    expect(screen.getByText('Your teacher moves these screens on')).toBeInTheDocument();
  });

  it('works the one fixed example out from this session’s own numbers', () => {
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 1 })} />);
    expect(screen.getByText('World production: 120.0 million barrels')).toBeInTheDocument();
    expect(
      screen.getByText('Price = $70.00 - $0.3 x 120.0 = $34.00 per barrel'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your profit = ($34.00 - $1.00) x 40.0 = $1,320.00M'),
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
      screen.getByText('Price = $60.00 - $0.2 x 150.0 = $30.00 per barrel'),
    ).toBeInTheDocument();
    expect(screen.getByText(/= \$1,400.00M$/)).toBeInTheDocument();
  });

  it('names the two roles, and no third one', () => {
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 2 })} />);
    expect(screen.getByText('Operator')).toBeInTheDocument();
    expect(screen.getByText('Envoy')).toBeInTheDocument();
    expect(screen.queryByText('Analyst')).not.toBeInTheDocument();
  });

  it('has nothing to click on any slide: no quick check, no calculator', () => {
    for (const slide of [0, 1, 2, 3]) {
      const view = render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: slide })} />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Quick check' })).toBeNull();
      view.unmount();
    }
  });

  it('describes a year without naming a removed feature', () => {
    render(<BriefingScreen view={teamView({ phase: 'BRIEFING', briefingSlide: 3 })} />);
    const text = screen.getByRole('heading', { name: 'How a year works' }).parentElement
      ?.textContent;
    expect(text).toBeTruthy();
    for (const gone of ['What-if', 'huddle', 'guess', 'trust', 'news', 'promise a number']) {
      expect(text?.toLowerCase()).not.toContain(gone.toLowerCase());
    }
    expect(text).toContain('turns messaging on');
  });
});
