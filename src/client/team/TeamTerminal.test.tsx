import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ackOk } from '@shared/protocol';
import type { TeamView } from '@shared/views';
import { NOW, messaging, reveal, teamView, yearRow } from '../../../tests/support/teamView';
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

const strip = () => screen.getByRole('group', { name: 'Your country and the clock' });

describe('TeamTerminal', () => {
  it('puts who, when, what to do and the total profit in the status strip', () => {
    at('YEAR_OPEN', { history: [yearRow(4)] });
    const bar = strip();
    expect(bar).toHaveTextContent('Borvia');
    expect(bar).toHaveTextContent('World 2');
    expect(bar).toHaveTextContent('Year');
    expect(bar).toHaveTextContent('Status');
    expect(bar).toHaveTextContent('Decide');
    expect(bar).toHaveTextContent('Your total profit');
    expect(bar).toHaveTextContent('$5,280.00M');
    expect(bar).toHaveTextContent('Connected');
  });

  it('says Waiting once the number is in, so the strip answers "what now?"', () => {
    at('YEAR_OPEN', { decision: { tenths: 383, auto: false, at: NOW, byInstructor: false } });
    expect(strip()).toHaveTextContent('Waiting');
  });

  it('names who is at the keyboard and who the Envoy is', () => {
    at('YEAR_OPEN');
    expect(screen.getByText('At the keyboard: Maya · Envoy: Leo and Sam')).toBeInTheDocument();
  });

  it('shows the reconnecting banner, with where the decisions are, when offline', () => {
    show({ status: 'offline' });
    expect(
      screen.getByText('Reconnecting... Your decisions are saved on the instructor’s computer.'),
    ).toBeInTheDocument();
    expect(strip()).toHaveTextContent('Offline');
  });

  it('shows no banner while it is connected', () => {
    show();
    expect(screen.queryByText(/Reconnecting\.\.\./)).toBeNull();
  });

  it.each([
    ['LOBBY', 'Waiting for your teacher to start'],
    ['BRIEFING', 'You run an oil country'],
  ] as const)('shows the %s screen', (phase, text) => {
    at(phase);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows the ENDED screen with the total and the three questions', () => {
    at('ENDED', { history: [yearRow(4)] });
    expect(screen.getByRole('heading', { name: 'Three questions' })).toBeInTheDocument();
    expect(screen.getByText('Borvia, total over every scored year')).toBeInTheDocument();
  });

  it('shows the decision box, and no calculator, in an open year', () => {
    at('YEAR_OPEN');
    expect(screen.getByLabelText('Million barrels')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'What-if calculator' })).toBeNull();
    expect(screen.queryByText(/my guess of the others/i)).toBeNull();
  });

  it('shows the result in a reveal', () => {
    at('YEAR_REVEAL', { reveal: reveal() });
    expect(screen.getByRole('heading', { name: 'Year 5 results' })).toBeInTheDocument();
  });

  it('sends the Envoys to the meeting point at a summit', () => {
    at('BETWEEN', { between: { kind: 'summit', afterYear: 7, seconds: 300 } });
    // Once in the status strip, once as the heading of the summit box.
    expect(screen.getAllByText('Summit')).toHaveLength(2);
    expect(screen.getByText(/go to the meeting point/)).toBeInTheDocument();
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

  it('gives every input on the year screen a label a screen reader can read', () => {
    at('YEAR_OPEN', { messaging: messaging({ on: true }) });
    const inputs = screen.getAllByRole('textbox');
    // The decision field and the message box, and nothing else to fill in.
    expect(inputs).toHaveLength(2);
    for (const box of inputs) expect(box).toHaveAccessibleName();
  });

  it('adds nothing to fill in once the number is submitted', () => {
    at('YEAR_OPEN', { decision: { tenths: 383, auto: false, at: NOW, byInstructor: false } });
    // The waiting question v1 added two guesses and five trust buttons here.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('removes every panel v2 dropped from the year screen', () => {
    at('YEAR_OPEN', { messaging: messaging({ on: true }) });
    for (const gone of ['Huddle', 'What-if', 'News', 'Promise a number', 'trust']) {
      expect(screen.queryByText(new RegExp(gone, 'i'))).toBeNull();
    }
  });
});
