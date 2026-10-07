import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  countryLine,
  publicSettings,
  reveal,
  teamView,
  yearRow,
} from '../../../tests/support/teamView';
import { RevealScreen } from './RevealScreen';

/**
 * The disclosure rules are enforced on the server, so what this screen has to
 * prove is that it shows nothing a view does not carry: a totalOnly view has
 * nulls where other countries' outputs would be, and nulls must not turn into a
 * row of numbers on screen.
 */
const full = teamView({
  phase: 'YEAR_REVEAL',
  settings: publicSettings({ disclosure: 'full' }),
  history: [yearRow(5, { ownActualTenths: 383, others: [countryLine('A'), countryLine('C')] })],
  reveal: reveal({
    countries: [
      countryLine('A', { actualTenths: 500, targetTenths: 500, pledgeTenths: 383 }),
      countryLine('B', { actualTenths: 383, targetTenths: 383, profitK: 1_264_000 }),
      countryLine('C', { actualTenths: 317, targetTenths: 317, pledgeTenths: 383 }),
    ],
  }),
});

const totalOnly = teamView({
  phase: 'YEAR_REVEAL',
  settings: publicSettings({ disclosure: 'totalOnly' }),
  history: [yearRow(5, { ownActualTenths: 383, others: null })],
  reveal: reveal({
    countries: [
      countryLine('A'),
      countryLine('B', { actualTenths: 383, targetTenths: 383, profitK: 1_264_000 }),
      countryLine('C'),
    ],
  }),
});

describe('RevealScreen', () => {
  it('leads with the price and the one sentence that explains it', () => {
    render(<RevealScreen view={full} />);
    // The same price is in the history table too, so look inside the headline.
    const headline = screen.getByText('Year 5 price').closest('.reveal-price');
    expect(headline).not.toBeNull();
    expect(within(headline as HTMLElement).getByText('$34.00')).toBeInTheDocument();
    expect(
      screen.getByText('Price fell $4.50 because world supply rose 15.0 million barrels.'),
    ).toBeInTheDocument();
  });

  it('shows this team its own output, profit and running total', () => {
    render(<RevealScreen view={full} />);
    expect(screen.getByText('38.3 million barrels')).toBeInTheDocument();
    expect(screen.getByText('$1,264.00M')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00M')).toBeInTheDocument();
  });

  it('compares each promise with what was produced under full disclosure', () => {
    render(<RevealScreen view={full} />);
    expect(screen.getByText('Promise kept?')).toBeInTheDocument();
    expect(screen.getByText('produced 11.7 more than promised')).toBeInTheDocument();
    expect(screen.getByText('produced 6.6 less than promised')).toBeInTheDocument();
  });

  it('shows no other country’s output when the view does not carry one', () => {
    render(<RevealScreen view={totalOnly} />);

    // Own output and the world total are allowed; a per-country table is not.
    expect(screen.getByText('38.3 million barrels')).toBeInTheDocument();
    expect(screen.getByText('120.0 million barrels')).toBeInTheDocument();
    expect(screen.queryByText('Promise kept?')).not.toBeInTheDocument();
    expect(screen.queryByText('50.0')).not.toBeInTheDocument();
    expect(screen.queryByText('31.7')).not.toBeInTheDocument();
    expect(screen.queryByText(/not shown/)).not.toBeInTheDocument();
  });

  it('marks an output the server filled in', () => {
    render(
      <RevealScreen
        view={teamView({
          phase: 'YEAR_REVEAL',
          reveal: reveal({ ownAuto: true, countries: [countryLine('B', { actualTenths: 383 })] }),
        })}
      />,
    );
    expect(screen.getByText('filled in for you')).toBeInTheDocument();
  });

  it('waits politely when there is no reveal yet', () => {
    render(<RevealScreen view={teamView({ phase: 'YEAR_REVEAL', reveal: null })} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for your teacher to show the results.',
    );
  });
});
