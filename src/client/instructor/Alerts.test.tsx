import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { instructorTeam, instructorView } from '../../../tests/support/instructorView';
import { NOW, timing } from '../../../tests/support/teamView';
import { Alerts, alertsFor } from './Alerts';

const oneWorld = (teams: ReturnType<typeof instructorTeam>[]) =>
  instructorView({ worldCount: 1, teams });

describe('the alerts list', () => {
  it('says nothing is wrong when nothing is', () => {
    render(
      <Alerts
        view={oneWorld([
          instructorTeam(1, 'A', {
            decision: { tenths: 383, auto: false, source: 'team', at: NOW },
          }),
        ])}
      />,
    );

    expect(
      screen.getByText('Nothing needs you. Everyone is connected and up to date.'),
    ).toBeInTheDocument();
  });

  it('names a country that has not submitted with 20 seconds left', () => {
    const view = oneWorld([
      instructorTeam(1, 'A', { decision: { tenths: 383, auto: false, source: 'team', at: NOW } }),
      instructorTeam(1, 'B'),
    ]);
    render(<Alerts view={{ ...view, timing: timing({ remainingMs: 20_000 }) }} />);

    expect(
      screen.getByText('World 1 - Borvia (B) has not submitted, 20 s left.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ardonia .* has not submitted/)).toBeNull();
  });

  it('holds that alert back while there is plenty of time', () => {
    const view = oneWorld([instructorTeam(1, 'B')]);
    const alerts = alertsFor({ ...view, timing: timing({ remainingMs: 90_000 }) });
    expect(alerts.some((alert) => alert.id.startsWith('late-'))).toBe(false);
  });

  it('holds it back while the game is paused, because the clock is not running', () => {
    const view = oneWorld([instructorTeam(1, 'B')]);
    const alerts = alertsFor({
      ...view,
      timing: timing({ remainingMs: 5_000, paused: true, deadline: null }),
    });
    expect(alerts.some((alert) => alert.id.startsWith('late-'))).toBe(false);
  });

  it('reports a terminal that has gone offline', () => {
    render(<Alerts view={oneWorld([instructorTeam(1, 'A', { connected: false })])} />);
    expect(screen.getByText(/Terminal offline: World 1 - Ardonia \(A\)/)).toBeInTheDocument();
  });

  it('says nothing about a country nobody has claimed yet', () => {
    const alerts = alertsFor(
      oneWorld([instructorTeam(1, 'A', { claimed: false, connected: false })]),
    );
    expect(alerts.some((alert) => alert.id.startsWith('offline-'))).toBe(false);
  });

  it('raises a takeover request', () => {
    render(<Alerts view={oneWorld([instructorTeam(1, 'C', { pendingTakeover: true })])} />);
    expect(
      screen.getByText(/Another computer wants to run World 1 - Cendra \(C\)/),
    ).toBeInTheDocument();
  });

  it('says the game was resumed after a restart', () => {
    const view = oneWorld([instructorTeam(1, 'A')]);
    render(
      <Alerts
        view={{
          ...view,
          timing: timing({
            paused: true,
            deadline: null,
            remainingMs: 60_000,
            resumedAfterRestart: true,
          }),
        }}
      />,
    );

    expect(screen.getByText(/Resumed after restart - press Resume/)).toBeInTheDocument();
  });

  it('counts the network checks the way SPEC 8.6 asks', () => {
    const view = instructorView({
      worldCount: 3,
      networkChecks: Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [
          `c${String(index)}`,
          {
            clientId: `c${String(index)}`,
            rttMs: 40,
            transport: 'websocket',
            at: NOW,
            teamId: null,
          },
        ]),
      ),
    });
    render(<Alerts view={view} />);

    expect(screen.getByText('Network check: 9 of 9 OK.')).toBeInTheDocument();
  });

  it('explains a slow computer in plain words rather than calling it a failure', () => {
    const view = instructorView({
      worldCount: 1,
      teams: [instructorTeam(1, 'A')],
      networkChecks: {
        fast: { clientId: 'fast', rttMs: 25, transport: 'websocket', at: NOW, teamId: null },
        slow: { clientId: 'slow', rttMs: 900, transport: 'polling', at: NOW, teamId: null },
      },
    });
    render(<Alerts view={view} />);

    expect(
      screen.getByText(
        'Network check: 1 of 2 OK. 1 computer answered slowly - they will still play, just a little behind.',
      ),
    ).toBeInTheDocument();
  });

  it('puts the restart first, because the room is waiting on it', () => {
    const view = oneWorld([instructorTeam(1, 'A', { connected: false, pendingTakeover: true })]);
    const alerts = alertsFor({
      ...view,
      timing: timing({
        paused: true,
        deadline: null,
        remainingMs: 1_000,
        resumedAfterRestart: true,
      }),
    });

    expect(alerts[0]?.id).toBe('restart');
    expect(alerts[0]?.tone).toBe('alert');
  });
});
