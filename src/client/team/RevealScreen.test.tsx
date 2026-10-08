import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ackOk } from '@shared/protocol';
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
      countryLine('A', { actualTenths: 500, targetTenths: 500 }),
      countryLine('B', { actualTenths: 383, targetTenths: 383, profitK: 1_264_000 }),
      countryLine('C', { actualTenths: 317, targetTenths: 317 }),
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

/** The reveal takes a sender for its messages box; nothing here sends. */
const send = () => vi.fn(() => Promise.resolve(ackOk('cmd-1', 1)));

/** The headline observation box, which is the first box on the screen. */
function headline(): HTMLElement {
  const box = screen
    .getByRole('heading', { name: 'Year 5 results' })
    .closest('.box');
  expect(box).not.toBeNull();
  return box as HTMLElement;
}

describe('RevealScreen', () => {
  it('leads with the price, its units and the one sentence that explains it', () => {
    render(<RevealScreen view={full} send={send()} />);
    // The same price is in the results table too, so look inside the headline.
    expect(within(headline()).getByText('$34.00')).toBeInTheDocument();
    expect(within(headline()).getByText('$ per barrel')).toBeInTheDocument();
    expect(
      screen.getByText('Price fell $4.50 because world supply rose 15.0 million barrels.'),
    ).toBeInTheDocument();
  });

  it('shows the change from last year with an arrow as well as a colour', () => {
    render(<RevealScreen view={full} send={send()} />);
    const change = within(headline()).getByText(/from last year/);
    expect(change).toHaveTextContent('$4.50 from last year');
    expect(change.className).toContain('obs-down');
    expect(change.textContent).toContain('▼');
  });

  it('shows this team its own output, profit and running total', () => {
    render(<RevealScreen view={full} send={send()} />);
    const facts = headline();
    expect(within(facts).getByText('38.3')).toBeInTheDocument();
    expect(within(facts).getByText('$1,264.00M')).toBeInTheDocument();
    expect(within(facts).getByText('$5,000.00M')).toBeInTheDocument();
  });

  it('shows what each country produced under full disclosure, and no promises', () => {
    render(<RevealScreen view={full} send={send()} />);
    const table = screen.getByRole('group', { name: 'What each country produced' });
    expect(within(table).getByText('Ardonia')).toBeInTheDocument();
    expect(within(table).getByText('50.0')).toBeInTheDocument();
    expect(within(table).getByText('Borvia (you)')).toBeInTheDocument();
    expect(screen.queryByText('Promise kept?')).not.toBeInTheDocument();
    expect(screen.queryByText('Promised')).not.toBeInTheDocument();
  });

  it('shows no other country’s output when the view does not carry one', () => {
    render(<RevealScreen view={totalOnly} send={send()} />);

    // Own output and the world total are allowed; a per-country table is not.
    expect(within(headline()).getByText('38.3')).toBeInTheDocument();
    expect(within(headline()).getByText('120.0')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'What each country produced' })).toBeNull();
    expect(
      screen.getByText(/you only see your own output/),
    ).toBeInTheDocument();
  });

  it('marks an output the server filled in', () => {
    render(
      <RevealScreen
        view={teamView({
          phase: 'YEAR_REVEAL',
          reveal: reveal({ ownAuto: true, countries: [countryLine('B', { actualTenths: 383 })] }),
        })}
        send={send()}
      />,
    );
    expect(screen.getAllByText('auto').length).toBeGreaterThan(0);
  });

  it('waits politely when there is no reveal yet', () => {
    render(
      <RevealScreen view={teamView({ phase: 'YEAR_REVEAL', reveal: null })} send={send()} />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Waiting for your teacher to show the results.',
    );
  });
});
