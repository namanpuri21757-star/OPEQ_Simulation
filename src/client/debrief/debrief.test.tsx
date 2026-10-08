import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { emptyDebrief, playedDebrief } from '../../../tests/support/debrief';
import { DebriefScreenView } from '.';

/**
 * The five debrief screens.
 *
 * What these check is what the design principles ask for: every chart has a
 * data table, every title states the finding in plain words, and the words are
 * neutral - nothing on these screens calls a world a loser.
 */
const debrief = playedDebrief();

function tableNamed(name: string | RegExp) {
  return screen.getByRole('table', { name });
}

describe('World Comparison', () => {
  it('is headed by the finding, not by a generic title', () => {
    render(<DebriefScreenView screen="worldComparison" debrief={debrief} worldNumber={null} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(debrief.titles.comparison);
    expect(debrief.titles.comparison).toMatch(/World \d came closest, keeping \d+%/);
  });

  it('draws both charts and puts the same numbers in a table behind each', () => {
    render(<DebriefScreenView screen="worldComparison" debrief={debrief} worldNumber={null} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    // Each chart's fold-away table, plus the one about the whole game.
    expect(screen.getAllByRole('table')).toHaveLength(3);

    const row = within(tableNamed(/Each world over the whole game/)).getByRole('row', {
      name: /World 1/,
    });
    expect(row.textContent).toContain(`${String(debrief.worlds[0]?.percentOfMax ?? 0)}%`);
    expect(row.textContent).toContain('Year 3');
  });

  it('says plainly that there is nothing to compare yet', () => {
    render(
      <DebriefScreenView screen="worldComparison" debrief={emptyDebrief()} worldNumber={null} />,
    );
    expect(screen.getByText(/nothing to compare/)).toBeInTheDocument();
  });
});

describe('World Detail', () => {
  it('is headed by what happened in that world', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={1} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(debrief.worlds[0]?.title);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain(
      'held together until Year 3',
    );
  });

  it('says who went furthest above an equal share each year', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={1} />);
    const years = screen.getByRole('table', { name: /Every year in this world/ });
    expect(within(years).getByRole('row', { name: /Year 1/ }).textContent).toContain(
      'nobody above it',
    );
    expect(within(years).getByRole('row', { name: /Year 3/ }).textContent).toContain(
      'Ardonia +96%',
    );
  });

  it('labels the moments that matter on the chart', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={1} />);
    expect(screen.getByText(/Messaging on after Year 2/)).toBeInTheDocument();
  });

  it('lists what was said, with the year each message came before', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={1} />);
    const timeline = screen.getByRole('list', { name: 'Message timeline' });
    expect(within(timeline).getAllByRole('listitem')).toHaveLength(3);
    expect(within(timeline).getByText('Shall we all keep to an equal share?')).toBeInTheDocument();
    expect(within(timeline).getAllByText('before Year 3').length).toBe(2);
    // No promise column: whether a country kept its word is read off the table.
    expect(screen.queryByText(/kept it: produced/)).toBeNull();
    expect(screen.queryByText('Promises kept, by country')).toBeNull();
  });

  it('counts the messages each country sent beside its total profit', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={1} />);
    const table = tableNamed(/Each country in this world/);
    expect(within(table).getByRole('row', { name: /Ardonia/ }).textContent).toContain('1');
    expect(within(table).getByRole('row', { name: /Cendra/ }).textContent).toContain('0');
  });

  it('shows the world asked for, not always the first one', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={2} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('World 2');
  });

  it('says so kindly when nobody in the world spoke', () => {
    render(<DebriefScreenView screen="worldDetail" debrief={debrief} worldNumber={2} />);
    expect(screen.getByText(/Nobody in this world sent a message/)).toBeInTheDocument();
  });
});

describe('the Leaderboard', () => {
  it('names the country that earned most in its title', () => {
    render(<DebriefScreenView screen="leaderboard" debrief={debrief} worldNumber={null} />);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(debrief.titles.leaderboard);
    expect(debrief.titles.leaderboard).toContain('earned the most');
  });

  it('lists every country and every world', () => {
    render(<DebriefScreenView screen="leaderboard" debrief={debrief} worldNumber={null} />);
    const countries = tableNamed(/Every country, by total profit/);
    // Six countries plus the header row.
    expect(within(countries).getAllByRole('row')).toHaveLength(7);
    const worlds = tableNamed(/Every world, by what the three countries made together/);
    expect(within(worlds).getAllByRole('row')).toHaveLength(3);
  });

  it('uses no shaming word anywhere', () => {
    const { container } = render(
      <DebriefScreenView screen="leaderboard" debrief={debrief} worldNumber={null} />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of ['loser', 'lost', 'worst', 'failed', 'bad']) {
      expect(text).not.toContain(word);
    }
  });
});

describe('Game theory', () => {
  it('explains the best response with the class’s own numbers', () => {
    render(<DebriefScreenView screen="gameTheory" debrief={debrief} worldNumber={null} />);
    expect(
      screen.getByText(/your best output = \(a - cost - b x everyone else\) \/ \(2 x b\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/38.3 million barrels each, which is 76.6 between them/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/comes out at 76.7, which is more than your capacity/),
    ).toBeInTheDocument();
  });

  it('shows both benchmarks and where each world landed', () => {
    render(<DebriefScreenView screen="gameTheory" debrief={debrief} worldNumber={null} />);
    const benchmarks = tableNamed(/The benchmarks for your settings/);
    expect(
      within(benchmarks).getByRole('row', { name: /Everyone cooperates/ }).textContent,
    ).toContain('$35.53');
    expect(
      within(benchmarks).getByRole('row', { name: /Everyone competes/ }).textContent,
    ).toContain('$18.25');
    expect(screen.getByText(/World 2 averaged/)).toBeInTheDocument();
  });
});

describe('the debrief questions', () => {
  it('asks all ten and offers evidence for each', async () => {
    const onShowEvidence = vi.fn();
    render(
      <DebriefScreenView
        screen="questions"
        debrief={debrief}
        worldNumber={null}
        onShowEvidence={onShowEvidence}
      />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(10);

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: /Show evidence: the best response/ }));
    expect(onShowEvidence).toHaveBeenCalledWith('gameTheory');
  });

  it('has no buttons at all when there is nothing to press', () => {
    render(<DebriefScreenView screen="questions" debrief={debrief} worldNumber={null} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
