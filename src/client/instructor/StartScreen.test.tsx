import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import {
  instructorTeam,
  instructorView,
  suggested,
} from '../../../tests/support/instructorView';
import { NOW } from '../../../tests/support/teamView';
import { StartScreen } from './StartScreen';

/**
 * The teacher's start screen (SPEC 8.4).
 *
 * It is five numbered steps and nothing else, and a teacher who has never seen
 * the app has to be able to work down it. The tests are therefore about what is
 * on the page and in what order, rather than about any one control.
 */
function sender(ack: Ack = ackOk('cmd-1', 2)) {
  return vi.fn(() => Promise.resolve(ack));
}

function show(over: Parameters<typeof instructorView>[0] = {}) {
  const send = sender();
  const onStart = vi.fn();
  render(
    <MemoryRouter>
      <StartScreen
        view={instructorView({
          phase: 'LOBBY',
          year: 0,
          // The one big button says what the server says, even here.
          suggested: suggested({
            command: 'setBriefingSlide',
            label: 'Start briefing',
            payload: { slide: 0 },
            expectedPhase: 'LOBBY',
            expectedYear: 0,
          }),
          ...over,
        })}
        send={send}
        onSaid={vi.fn()}
        onStart={onStart}
      />
    </MemoryRouter>,
  );
  return { send, onStart, user: userEvent.setup() };
}

describe('the start screen', () => {
  it('names the game and the session in one header line', () => {
    show();
    expect(screen.getByRole('heading', { level: 1, name: 'Crude Accord' })).toBeInTheDocument();
    expect(screen.getByText('3 worlds · 9 countries · Session session-demo')).toBeInTheDocument();
  });

  it('is five numbered steps, in the order a teacher does them', () => {
    show();
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual([
      'Step 1 Print team cards',
      'Step 2 Open the projector',
      'Step 3 Connect the team computers',
      'Step 4 How the class runs',
      'Step 5 Start',
    ]);
  });

  it('shows all nine cards, each with its code, its world and a QR code', () => {
    show();
    const cards = screen.getAllByRole('img', { name: /Join link for/ });
    expect(cards).toHaveLength(9);
    // Three worlds across, three countries down.
    expect(screen.getAllByText('World 1')).toHaveLength(3);
    expect(screen.getByText('W1AXYZ')).toBeInTheDocument();
  });

  it('counts the computers that are connected', () => {
    show({
      teams: [
        instructorTeam(1, 'A'),
        instructorTeam(1, 'B'),
        instructorTeam(1, 'C', { connected: false, claimed: false }),
      ],
      worldCount: 1,
    });
    expect(screen.getByText('2 of 3 connected')).toBeInTheDocument();
    expect(screen.getAllByText('Connected')).toHaveLength(2);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('starts even when some computers have not joined, and says so', async () => {
    const { onStart, user } = show({
      teams: [
        instructorTeam(1, 'A'),
        instructorTeam(1, 'B', { connected: false, claimed: false }),
        instructorTeam(1, 'C', { connected: false, claimed: false }),
      ],
      worldCount: 1,
    });

    expect(screen.getByText('2 not connected yet. They can join late.')).toBeInTheDocument();
    const start = screen.getByRole('button', { name: /Start briefing/ });
    expect(start).not.toBeDisabled();
    await user.click(start);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('says so when every computer is there', () => {
    show();
    expect(screen.getByText('Every computer is connected.')).toBeInTheDocument();
  });

  it('gives the plan as a handful of one-line steps with rough minutes', () => {
    show();
    const plan = screen.getByRole('list');
    const steps = within(plan).getAllByRole('listitem');
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.length).toBeLessThanOrEqual(6);
    for (const step of steps) expect(step.textContent).toMatch(/\d+ min$/);
  });

  it('has exactly one solid primary button per step that needs one', () => {
    show();
    // Print cards and Start briefing; everything else is outlined.
    const primary = [
      ...screen.getAllByRole('button'),
      ...screen.getAllByRole('link'),
    ].filter((element) => element.className.includes('btn-primary'));
    expect(primary.map((element) => element.textContent).sort()).toEqual([
      'Print cards▸',
      'Start briefing▸',
    ]);
  });

  it('keeps the settings and the materials small, in the corner', () => {
    show();
    expect(screen.getByRole('link', { name: 'Lesson settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Materials' })).toBeInTheDocument();
  });

  it('has no settings form on it at all', () => {
    show();
    expect(screen.queryByText('Advanced settings')).toBeNull();
    expect(screen.queryByLabelText('Worlds')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save settings' })).toBeNull();
  });

  it('asks about a takeover inside the cell it belongs to', () => {
    show({
      worldCount: 1,
      teams: [
        instructorTeam(1, 'A', { pendingTakeover: true }),
        instructorTeam(1, 'B'),
        instructorTeam(1, 'C'),
      ],
    });
    expect(
      screen.getByRole('button', { name: 'Move World 1 - Ardonia (A) here' }),
    ).toBeInTheDocument();
  });

  it('asks a group to run the network check until one has', () => {
    show();
    expect(screen.getByText(/press Start the check/)).toBeInTheDocument();
  });

  it('reports the network check once results arrive', () => {
    show({
      networkChecks: {
        c1: { clientId: 'c1', rttMs: 40, transport: 'websocket', at: NOW, teamId: 'world-1-A' },
        c2: { clientId: 'c2', rttMs: 900, transport: 'polling', at: NOW, teamId: 'world-1-B' },
      },
    });
    expect(screen.getByText('Network check: 1 of 2 OK, 1 slow.')).toBeInTheDocument();
  });
});
