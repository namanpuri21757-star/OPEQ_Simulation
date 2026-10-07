import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import {
  INSTRUCTOR_KEY,
  instructorTeam,
  instructorView,
  type InstructorViewOptions,
} from '../../../tests/support/instructorView';
import { LobbyPanel } from './LobbyPanel';

function sender(ack: Ack = ackOk('cmd-1', 3)) {
  return vi.fn(() => Promise.resolve(ack));
}

function renderLobby(over: InstructorViewOptions = {}) {
  const send = sender();
  const said = vi.fn();
  render(
    <MemoryRouter>
      <LobbyPanel
        view={instructorView({ phase: 'LOBBY', year: 0, ...over })}
        send={send}
        onSaid={said}
      />
    </MemoryRouter>,
  );
  return { send, said, user: userEvent.setup() };
}

function callOf(send: ReturnType<typeof sender>) {
  return send.mock.calls[0] as unknown as [string, Record<string, unknown>];
}

describe('the lobby', () => {
  it('puts the join address and a QR code where the room can read them', () => {
    renderLobby();

    expect(screen.getByText('http://localhost:3000/join')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'QR code for http://localhost:3000/join' }),
    ).toBeVisible();
  });

  it('lists every team with its code and a status in words', () => {
    renderLobby({
      worldCount: 1,
      teams: [
        instructorTeam(1, 'A'),
        instructorTeam(1, 'B', { connected: false }),
        instructorTeam(1, 'C', { claimed: false, connected: false }),
      ],
    });

    expect(screen.getByText('W1AXYZ')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText('No computer yet')).toBeInTheDocument();
  });

  it('shows the member names, or says plainly that there are none', () => {
    renderLobby({
      worldCount: 1,
      teams: [instructorTeam(1, 'A'), instructorTeam(1, 'B', { members: [] })],
    });

    expect(screen.getByText('Ada, Ben')).toBeInTheDocument();
    expect(screen.getByText('No names yet')).toBeInTheDocument();
  });

  it('offers Approve and Deny only for a team that asked', async () => {
    const { send, user } = renderLobby({
      worldCount: 1,
      teams: [instructorTeam(1, 'A', { pendingTakeover: true }), instructorTeam(1, 'B')],
    });

    expect(
      screen.queryByRole('button', { name: /Approve new computer for World 1 - Borvia/ }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Approve new computer for World 1 - Ardonia (A)' }),
    );
    expect(callOf(send)).toEqual(['approveTakeover', { teamId: 'world-1-A' }]);
  });

  it('denies a takeover request', async () => {
    const { send, user } = renderLobby({
      worldCount: 1,
      teams: [instructorTeam(1, 'A', { pendingTakeover: true })],
    });

    await user.click(screen.getByRole('button', { name: 'Deny for World 1 - Ardonia (A)' }));
    expect(callOf(send)).toEqual(['denyTakeover', { teamId: 'world-1-A' }]);
  });

  it('confirms before releasing a terminal, and says what happens to the decisions', async () => {
    const { send, user } = renderLobby({ worldCount: 1, teams: [instructorTeam(1, 'A')] });

    await user.click(screen.getByRole('button', { name: 'Release World 1 - Ardonia (A)' }));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText(/can be claimed again with the code W1AXYZ/)).toBeInTheDocument();
    expect(screen.getByText(/Decisions already made are kept/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, release it' }));
    expect(callOf(send)).toEqual(['releaseTerminal', { teamId: 'world-1-A' }]);
  });

  it('has nothing to release for a country nobody has claimed', () => {
    renderLobby({ worldCount: 1, teams: [instructorTeam(1, 'A', { claimed: false })] });
    expect(screen.queryByRole('button', { name: /^Release/ })).toBeNull();
  });

  it('links to the printable cards, and shows no instructor key', () => {
    const { container } = render(
      <MemoryRouter>
        <LobbyPanel view={instructorView({ phase: 'LOBBY' })} send={sender()} onSaid={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Print team cards' })).toHaveAttribute(
      'href',
      '/instructor/cards',
    );
    expect(container.innerHTML).not.toContain(INSTRUCTOR_KEY);
  });
});
