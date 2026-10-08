import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import {
  instructorTeam,
  instructorView,
  instructorWorld,
  suggested,
} from '../../../tests/support/instructorView';
import { NOW } from '../../../tests/support/teamView';
import { LiveScreen } from './LiveScreen';

/**
 * The teacher's live screen (SPEC 8.4), read top to bottom.
 *
 * Three rules are tested here, because they are the ones v1 broke. The status
 * strip holds exactly the six facts a teacher glances at. Only the controls that
 * work right now are drawn, and the rest are not drawn greyed out. And a problem
 * shows in the cell it belongs to, not in a list somewhere else.
 */
function sender(ack: Ack = ackOk('cmd-1', 3)) {
  return vi.fn(() => Promise.resolve(ack));
}

function show(over: Parameters<typeof instructorView>[0] = {}) {
  const send = sender();
  render(
    <MemoryRouter>
      <LiveScreen
        view={instructorView(over)}
        send={send}
        status="online"
        serverNow={() => NOW}
        onDeleted={vi.fn()}
      />
    </MemoryRouter>,
  );
  return { send, user: userEvent.setup() };
}

const strip = () => screen.getByRole('group', { name: 'Where the game is' });

describe('the status strip', () => {
  it('holds the year, the status, the clock, the count and the messaging state', () => {
    show({ phase: 'YEAR_OPEN', year: 5 });
    expect(strip()).toHaveTextContent('Year');
    expect(strip()).toHaveTextContent('Status');
    expect(strip()).toHaveTextContent('Deciding');
    expect(strip()).toHaveTextContent('Time left');
    expect(strip()).toHaveTextContent('2:00');
    expect(strip()).toHaveTextContent('Submitted');
    expect(strip()).toHaveTextContent('0 / 9');
    expect(strip()).toHaveTextContent('Messaging');
    expect(strip()).toHaveTextContent('OFF');
  });

  it('counts the countries that have submitted', () => {
    show({
      phase: 'YEAR_OPEN',
      teams: [
        instructorTeam(1, 'A', {
          decision: { tenths: 383, auto: false, source: 'team', at: NOW },
        }),
        instructorTeam(1, 'B'),
        instructorTeam(1, 'C'),
      ],
    });
    expect(strip()).toHaveTextContent('1 / 3');
  });

  it('reads BRIEFING and the screen number during the briefing', () => {
    show({ phase: 'BRIEFING', briefingSlide: 1 });
    expect(strip()).toHaveTextContent('BRIEFING');
    expect(strip()).toHaveTextContent('2 of 4');
    // None of the year fields mean anything yet, so none of them are drawn.
    expect(strip()).not.toHaveTextContent('Submitted');
    expect(strip()).not.toHaveTextContent('Time left');
  });

  it('says ON, and which worlds, once messaging is on in some of them', () => {
    show({
      messaging: [
        { worldId: 'world-1', worldNumber: 1, on: true, until: NOW + 60_000 },
        { worldId: 'world-2', worldNumber: 2, on: false, until: null },
        { worldId: 'world-3', worldNumber: 3, on: false, until: null },
      ],
    });
    expect(strip()).toHaveTextContent('ON (1 of 3 worlds)');
  });
});

describe('the next step', () => {
  it('says what the step is and what pressing it does', () => {
    show({ phase: 'YEAR_OPEN', suggested: suggested() });
    expect(screen.getByRole('button', { name: /Close Year 5/ })).toBeInTheDocument();
    expect(
      screen.getByText('Fills in any country that did not submit, then scores every world at once.'),
    ).toBeInTheDocument();
  });

  it('asks before it does anything', async () => {
    const { send, user } = show({ phase: 'YEAR_OPEN' });
    await user.click(screen.getByRole('button', { name: /Close Year 5/ }));

    expect(send).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Close Year 5?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Yes, close year 5/i }));
    expect(send).toHaveBeenCalledWith(
      'closeYear',
      {},
      { expectedPhase: 'YEAR_OPEN', expectedYear: 5 },
    );
  });

  it('draws only the controls that work right now', () => {
    show({ phase: 'YEAR_OPEN' });
    const controls = screen.getByRole('group', { name: 'Controls you can use now' });
    expect(within(controls).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(within(controls).getByRole('button', { name: '+30 s' })).toBeInTheDocument();
    expect(within(controls).getByRole('button', { name: 'Close year now' })).toBeInTheDocument();
    // Nothing is greyed out: every button on screen can be pressed.
    for (const button of within(controls).getAllByRole('button')) {
      expect(button).not.toBeDisabled();
    }
  });

  it('draws no timer controls and no close button between years', () => {
    show({ phase: 'YEAR_REVEAL', timing: { ...instructorView().timing, deadline: null, remainingMs: null } });
    const controls = screen.getByRole('group', { name: 'Controls you can use now' });
    expect(within(controls).queryByRole('button', { name: 'Pause' })).toBeNull();
    expect(within(controls).queryByRole('button', { name: '+30 s' })).toBeNull();
    expect(within(controls).queryByRole('button', { name: 'Close year now' })).toBeNull();
  });

  it('keeps the rare actions behind More, and asks about each one', async () => {
    const { user } = show({ phase: 'YEAR_REVEAL', year: 11 });
    expect(screen.queryByRole('button', { name: /new producer/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /More/ }));
    expect(
      screen.getByRole('button', { name: 'Bring in the new producer now' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Final-year warning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'End game' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'End game' }));
    expect(screen.getByRole('dialog', { name: 'End the game now?' })).toBeInTheDocument();
  });

  it('offers no announcement and no demand change at all', async () => {
    const { user } = show({ phase: 'YEAR_REVEAL' });
    await user.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.queryByRole('button', { name: /Announcement/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /demand/i })).toBeNull();
  });
});

describe('the countries grid', () => {
  it('shows a tick and the number for a country that has submitted', () => {
    show({
      phase: 'YEAR_OPEN',
      worldCount: 1,
      teams: [
        instructorTeam(1, 'A', {
          decision: { tenths: 383, auto: false, source: 'team', at: NOW },
        }),
        instructorTeam(1, 'B', {
          decision: { tenths: 400, auto: true, source: 'auto', at: NOW },
        }),
        instructorTeam(1, 'C'),
      ],
      worlds: [instructorWorld(1)],
    });

    const grid = screen.getByRole('group', { name: 'Every country, world by world' });
    expect(within(grid).getByText('38.3')).toBeInTheDocument();
    expect(within(grid).getByText('40.0')).toBeInTheDocument();
    expect(within(grid).getByText('auto')).toBeInTheDocument();
    // The country that has not submitted shows a dash, not a blank.
    expect(within(grid).getByText('–')).toBeInTheDocument();
  });

  it('shows a problem in the cell it belongs to, and one line at the top', () => {
    show({
      phase: 'YEAR_OPEN',
      worldCount: 1,
      worlds: [instructorWorld(1)],
      teams: [
        instructorTeam(1, 'A', { connected: false }),
        instructorTeam(1, 'B'),
        instructorTeam(1, 'C'),
      ],
    });

    const grid = screen.getByRole('group', { name: 'Every country, world by world' });
    expect(within(grid).getByText('Offline')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('World 1 - Ardonia (A) went offline');
    // There is no separate list of things to look at any more.
    expect(screen.queryByRole('heading', { name: /Things to look at/ })).toBeNull();
  });

  it('says No computer for a country nobody has claimed', () => {
    show({
      phase: 'YEAR_OPEN',
      worldCount: 1,
      worlds: [instructorWorld(1)],
      teams: [
        instructorTeam(1, 'A', { claimed: false, connected: false }),
        instructorTeam(1, 'B'),
        instructorTeam(1, 'C'),
      ],
    });
    expect(screen.getByText('No computer')).toBeInTheDocument();
  });
});

describe('the results tables', () => {
  it('shows nothing at all before the first year closes', () => {
    show({ phase: 'YEAR_OPEN' });
    expect(screen.queryByRole('heading', { name: 'Results' })).toBeNull();
  });

  it('shows one table per world, newest year at the top', () => {
    const record = (year: number, priceCents: number) => ({
      year,
      isPractice: false,
      priceCents,
      totalTenths: 1149,
      newProducerTenths: 0,
      countries: (['A', 'B', 'C'] as const).map((letter) => ({
        letter,
        targetTenths: 383,
        actualTenths: 383,
        auto: false,
        profitK: 1_000_000,
        source: 'team',
      })),
    });

    show({
      phase: 'YEAR_REVEAL',
      worldCount: 1,
      worlds: [instructorWorld(1, { records: [record(1, 4003), record(2, 3553)] })],
    });

    const table = screen.getByRole('group', { name: 'World 1' });
    const rows = within(table).getAllByRole('row');
    // Header, then Year 2 before Year 1.
    expect(within(rows[1] as HTMLElement).getByText('2')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('1')).toBeInTheDocument();
    expect(within(table).getByText('$35.53')).toBeInTheDocument();
  });
});

describe('the footer', () => {
  it('names the two keyboard shortcuts', () => {
    show();
    expect(screen.getByText(/for the next step/)).toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
    expect(screen.getByText('Space')).toBeInTheDocument();
  });
});
