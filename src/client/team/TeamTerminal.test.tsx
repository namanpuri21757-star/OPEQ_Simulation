import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ackOk } from '@shared/protocol';
import type { TeamView } from '@shared/views';
import { NOW, reveal, teamView } from '../../../tests/support/teamView';
import { Connection, memoryStore, type ConnectionBundle } from '../net';
import { ConnectionValueProvider } from '../net/ConnectionProvider';
import TeamTerminal from './TeamTerminal';

function bundle(over: Partial<ConnectionBundle> = {}): ConnectionBundle {
  return {
    status: 'online',
    view: teamView(),
    version: 7,
    needsClaim: false,
    teamId: 'world-2-B',
    gone: null,
    problem: null,
    claimed: null,
    pending: 0,
    send: vi.fn(() => Promise.resolve(ackOk('cmd-1', 8))),
    serverNow: () => NOW,
    // Never started, so it opens no socket: this test is about the screens.
    connection: new Connection({ sessionId: 'session-demo', role: 'team', store: memoryStore() }),
    ...over,
  };
}

function show(over: Partial<ConnectionBundle> = {}) {
  return render(
    <MemoryRouter initialEntries={['/team']}>
      <ConnectionValueProvider value={bundle(over)}>
        <TeamTerminal />
      </ConnectionValueProvider>
    </MemoryRouter>,
  );
}

const at = (phase: TeamView['phase'], over: Partial<TeamView> = {}) =>
  show({ view: teamView({ phase, ...over }) });

describe('TeamTerminal', () => {
  it('always says who and when at the top', () => {
    at('YEAR_OPEN');
    expect(screen.getByRole('heading', { level: 1, name: 'Borvia' })).toBeInTheDocument();
    expect(screen.getByText('World 2 - Borvia (B)')).toBeInTheDocument();
    expect(screen.getByText('Year 5')).toBeInTheDocument();
    expect(screen.getByText('Year is open')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows the reconnecting banner, with where the decisions are, when offline', () => {
    show({ status: 'offline' });
    expect(
      screen.getByText('Reconnecting... Your decisions are saved on the instructor’s computer.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();
  });

  it('shows no banner while it is connected', () => {
    show();
    expect(screen.queryByText(/Reconnecting\.\.\./)).toBeNull();
  });

  it.each([
    ['LOBBY', 'Waiting for your teacher to start'],
    ['BRIEFING', 'You run an oil country'],
    ['ENDED', 'The game has finished'],
  ] as const)('shows the %s screen', (phase, heading) => {
    at(phase);
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
  });

  it('shows the decision box in an open year', () => {
    at('YEAR_OPEN');
    expect(
      screen.getByLabelText('How many million barrels will Borvia produce?'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What-if calculator' })).toBeInTheDocument();
  });

  it('shows the result in a reveal', () => {
    at('YEAR_REVEAL', { reveal: reveal() });
    expect(screen.getByRole('heading', { name: 'Year 5 results' })).toBeInTheDocument();
  });

  it('sends the Envoys to the meeting point at a summit', () => {
    at('BETWEEN', { between: { kind: 'summit', afterYear: 7, seconds: 300 }, chatOpen: true });
    expect(
      screen.getByRole('heading', { name: 'Envoys: go to the meeting point' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Summit')).toBeInTheDocument();
  });

  it('names the chat window when that is what is open', () => {
    at('BETWEEN', { between: { kind: 'chat', afterYear: 3, seconds: 240 }, chatOpen: true });
    expect(screen.getByRole('heading', { name: 'Chat window' })).toBeInTheDocument();
  });

  it('warns about the final year once it is announced', () => {
    at('YEAR_OPEN', { finalYearAnnounced: true });
    expect(screen.getByText('Your teacher says this is the final year.')).toBeInTheDocument();
  });

  it('says so, kindly, when another computer takes the team over', () => {
    show({
      gone: { reason: 'takenOver', message: 'This team is now controlled from another computer.' },
    });
    expect(
      screen.getByRole('heading', { name: 'This team moved to another computer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('This team is now controlled from another computer.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join again with our code' })).toBeInTheDocument();
  });

  /** Everything a student can type in or drag, whichever of them is on screen. */
  const inputs = () => [
    ...screen.queryAllByRole('textbox'),
    ...screen.queryAllByRole('slider'),
    ...screen.queryAllByRole('radio'),
  ];

  it('gives every input on the year screen a label a screen reader can read', () => {
    at('YEAR_OPEN');
    const before = inputs();
    // The decision field, the slider, the what-if pair, the huddle and its reason.
    expect(before.length).toBeGreaterThan(5);
    for (const box of before) expect(box).toHaveAccessibleName();
  });

  it('gives every input the waiting question adds a label as well', () => {
    at('YEAR_OPEN', { decision: { tenths: 383, auto: false, at: NOW, byInstructor: false } });
    const after = inputs();
    // Two guesses and the five trust buttons arrive once the number is in.
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    for (const box of after) expect(box).toHaveAccessibleName();
  });

  it('gives every input on the chat screen a label too', () => {
    at('BETWEEN', { between: { kind: 'chat', afterYear: 3, seconds: 240 }, chatOpen: true });
    for (const box of screen.getAllByRole('textbox')) expect(box).toHaveAccessibleName();
  });
});
