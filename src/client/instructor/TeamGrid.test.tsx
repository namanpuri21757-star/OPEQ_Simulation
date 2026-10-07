import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InstructorView } from '@shared/views';
import { instructorTeam, instructorView } from '../../../tests/support/instructorView';
import { NOW } from '../../../tests/support/teamView';
import { TeamGrid } from './TeamGrid';

function renderGrid(
  teams: ReturnType<typeof instructorTeam>[],
  phase: InstructorView['phase'] = 'YEAR_OPEN',
) {
  const onOverride = vi.fn();
  const onMute = vi.fn();
  render(
    <TeamGrid
      view={instructorView({ worldCount: 1, phase, teams })}
      onOverride={onOverride}
      onMute={onMute}
    />,
  );
  return { onOverride, onMute, user: userEvent.setup() };
}

/** The cell for one country of world 1, found through the row it is in. */
function cell(country: string) {
  return within(screen.getByRole('row', { name: new RegExp(country) })).getAllByRole('cell')[0];
}

describe('the live grid', () => {
  it('is a table with one column per world and one row per country', () => {
    render(
      <TeamGrid view={instructorView({ worldCount: 3 })} onOverride={vi.fn()} onMute={vi.fn()} />,
    );

    for (const world of ['World 1', 'World 2', 'World 3']) {
      expect(screen.getByRole('columnheader', { name: world })).toBeInTheDocument();
    }
    for (const country of ['Ardonia', 'Borvia', 'Cendra']) {
      expect(screen.getByRole('rowheader', { name: new RegExp(country) })).toBeInTheDocument();
    }
  });

  it('marks an auto-filled number as auto', () => {
    renderGrid([
      instructorTeam(1, 'A', {
        decision: { tenths: 400, auto: true, source: 'auto', at: NOW },
      }),
      instructorTeam(1, 'B'),
      instructorTeam(1, 'C'),
    ]);

    expect(cell('Ardonia')).toHaveTextContent('40.0 million barrels (auto)');
  });

  it('says when a number came from the instructor', () => {
    renderGrid([
      instructorTeam(1, 'A', {
        decision: { tenths: 383, auto: false, source: 'instructor', at: NOW },
      }),
      instructorTeam(1, 'B'),
      instructorTeam(1, 'C'),
    ]);

    expect(cell('Ardonia')).toHaveTextContent('38.3 million barrels (changed by you)');
  });

  it('says in words that a terminal is offline, not only with a dot', () => {
    renderGrid([
      instructorTeam(1, 'A', { connected: false }),
      instructorTeam(1, 'B', { claimed: false, connected: false }),
      instructorTeam(1, 'C'),
    ]);

    expect(cell('Ardonia')).toHaveTextContent('Offline');
    expect(cell('Borvia')).toHaveTextContent('No computer yet');
    expect(cell('Cendra')).toHaveTextContent('Connected');
  });

  it('shows what is still missing while a year is open', () => {
    renderGrid([instructorTeam(1, 'A'), instructorTeam(1, 'B'), instructorTeam(1, 'C')]);
    expect(cell('Ardonia')).toHaveTextContent('Not submitted');
    expect(screen.getByText('0 of 3 have submitted.')).toBeInTheDocument();
  });

  it('shows the huddle, prediction and muted marks', () => {
    renderGrid([
      instructorTeam(1, 'A', { huddleRecorded: true, predictionRecorded: true, muted: true }),
      instructorTeam(1, 'B'),
      instructorTeam(1, 'C'),
    ]);

    const ardonia = cell('Ardonia');
    expect(ardonia).toHaveTextContent('Huddle in');
    expect(ardonia).toHaveTextContent('Prediction in');
    expect(ardonia).toHaveTextContent('Muted');
  });

  it('cannot change a number when no year is open', () => {
    renderGrid(
      [instructorTeam(1, 'A'), instructorTeam(1, 'B'), instructorTeam(1, 'C')],
      'YEAR_REVEAL',
    );

    expect(cell('Ardonia')).toHaveTextContent('No year open');
    expect(screen.getByRole('button', { name: /^Change World 1 - Ardonia/ })).toBeDisabled();
  });

  it('names the country in every button, so the row header is not the only clue', async () => {
    const { onOverride, onMute, user } = renderGrid([
      instructorTeam(1, 'A'),
      instructorTeam(1, 'B'),
      instructorTeam(1, 'C'),
    ]);

    await user.click(screen.getByRole('button', { name: 'Change World 1 - Borvia (B)' }));
    expect(onOverride).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'world-1-B' }));

    await user.click(screen.getByRole('button', { name: 'Mute World 1 - Cendra (C)' }));
    expect(onMute).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'world-1-C' }));
  });
});
