import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  INSTRUCTOR_KEY,
  PROJECTOR_KEY,
  projectorView,
} from '../../../tests/support/instructorView';
import { NOW, timing } from '../../../tests/support/teamView';
import { playedDebrief } from '../../../tests/support/debrief';
import ProjectorPage, { ProjectorScreen } from './ProjectorPage';

const show = (over: Parameters<typeof projectorView>[0] = {}) => {
  const view = projectorView(over);
  return render(<ProjectorScreen view={view} serverNow={() => NOW} />);
};

describe('the projector in the lobby', () => {
  it('shows how to join, with a QR code drawn on this computer', () => {
    show({ phase: 'LOBBY', year: 0 });

    expect(screen.getByRole('heading', { name: 'Open this on your team computer' })).toBeVisible();
    expect(screen.getByText('http://localhost:3000/join')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'QR code for http://localhost:3000/join' }),
    ).toBeVisible();
  });

  it('shows a Find your table card for every country', () => {
    show({ phase: 'LOBBY', year: 0, worldCount: 2 });

    expect(screen.getByRole('heading', { name: 'Find your table' })).toBeVisible();
    expect(screen.getAllByText('Ardonia (A)')).toHaveLength(2);
    expect(screen.getAllByText('waiting')).toHaveLength(6);
  });
});

describe('the projector during play', () => {
  it('shows the year, the phase and the clock in one strip', () => {
    show({ phase: 'YEAR_OPEN', year: 5 });

    const strip = screen.getByRole('group', { name: 'Where the game is' });
    expect(strip).toHaveTextContent('DECIDE NOW');
    expect(strip).toHaveTextContent('Year');
    expect(strip).toHaveTextContent('5');
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('says whether messaging is on, and how long is left', () => {
    const off = show({ phase: 'YEAR_REVEAL' });
    expect(screen.getByRole('group', { name: 'Where the game is' })).toHaveTextContent('OFF');
    off.unmount();

    show({ phase: 'YEAR_REVEAL', messaging: { on: true, until: NOW + 192_000 } });
    const strip = screen.getByRole('group', { name: 'Where the game is' });
    expect(strip).toHaveTextContent('ON');
    expect(strip).toHaveTextContent('3:12');
  });

  it('says FINAL YEAR once the warning has been given', () => {
    show({ phase: 'YEAR_OPEN', finalYearAnnounced: true });
    expect(screen.getByRole('group', { name: 'Where the game is' })).toHaveTextContent('FINAL YEAR');
  });

  it('labels the practice year as PRACTICE', () => {
    show({ phase: 'PRACTICE_OPEN', year: 0 });
    expect(screen.getByText('PRACTICE')).toBeInTheDocument();
  });

  it('sends the Envoys to the meeting point during a summit', () => {
    show({ phase: 'BETWEEN', between: { kind: 'summit', afterYear: 7, seconds: 300 } });
    expect(screen.getByText('Envoys: go to the meeting point.')).toBeInTheDocument();
  });
});

describe('the projector at a reveal', () => {
  it('shows each world’s price, its change and its results table', () => {
    show({
      phase: 'YEAR_REVEAL',
      worldCount: 2,
      worlds: [
        {
          worldNumber: 1,
          priceCents: 3553,
          priceChangeCents: -450,
          year: 5,
          messagingOn: false,
          rows: [
            { year: 5, isPractice: false, label: 'Year 5', priceCents: 3553, totalTenths: 1149 },
            { year: 4, isPractice: false, label: 'Year 4', priceCents: 4003, totalTenths: 999 },
          ],
        },
        {
          worldNumber: 2,
          priceCents: 1825,
          priceChangeCents: 100,
          year: 5,
          messagingOn: false,
          rows: [
            { year: 5, isPractice: false, label: 'Year 5', priceCents: 1825, totalTenths: 1725 },
          ],
        },
      ],
    });

    expect(screen.getAllByText('$35.53').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$18.25').length).toBeGreaterThan(0);
    // The change reads with an arrow as well as a colour.
    expect(screen.getByText(/\$4\.50/).textContent).toContain('\u25bc');
    expect(screen.getByText(/\$1\.00/).textContent).toContain('\u25b2');
    // And each world's own table is there.
    expect(screen.getByRole('group', { name: 'World 1 by year' })).toBeInTheDocument();
  });

  it('shows no price when the instructor has turned prices off', () => {
    // With projectorShowsPrices off the server never fills the price in, so the
    // screen has nothing to show and says nothing about it.
    show({
      phase: 'YEAR_REVEAL',
      showsPrices: false,
      worlds: [
        {
          worldNumber: 1,
          priceCents: null,
          priceChangeCents: null,
          year: null,
          rows: [],
          messagingOn: false,
        },
      ],
    });

    expect(screen.queryByText('$35.53')).toBeNull();
    expect(screen.queryByRole('group', { name: 'World 1 by year' })).toBeNull();
  });
});

describe('the projector during the debrief', () => {
  const debrief = playedDebrief();

  it('shows exactly the screen the instructor sent', () => {
    show({ phase: 'ENDED', screen: 'leaderboard', worldNumber: null, debrief });
    expect(
      screen.getByRole('heading', { level: 2, name: debrief.titles.leaderboard }),
    ).toBeVisible();
    // The room screen is gone while a debrief screen is up.
    expect(screen.queryByText('Game over')).toBeNull();
  });

  it('shows the world the instructor picked', () => {
    show({ phase: 'ENDED', screen: 'worldDetail', worldNumber: 2, debrief });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('World 2');
  });

  it('waits politely when a debrief screen was sent before the game ended', () => {
    // The server only fills the debrief in once the game has ended, so this is
    // what a terminal-free room sees if the teacher presses too early.
    show({ phase: 'YEAR_OPEN', screen: 'leaderboard', debrief: null });
    expect(screen.getByText('Your teacher is about to show something here.')).toBeInTheDocument();
  });

  it('still has no controls on it', () => {
    show({ phase: 'ENDED', screen: 'questions', debrief });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('what the projector must never show', () => {
  it('carries no message, no team-private data and no key', () => {
    const { container } = render(
      <ProjectorScreen
        view={projectorView({
          phase: 'YEAR_REVEAL',
          timing: timing(),
          messaging: { on: true, until: NOW + 60_000 },
          worlds: [
            {
              worldNumber: 1,
              priceCents: 3553,
              priceChangeCents: null,
              year: 5,
              rows: [],
              messagingOn: true,
            },
          ],
        })}
        serverNow={() => NOW}
      />,
    );
    const html = container.innerHTML;

    // The view itself cannot carry these, which is the real guarantee; this
    // checks the screen has not grown a way to show them anyway.
    expect(html).not.toContain(INSTRUCTOR_KEY);
    expect(html).not.toContain(PROJECTOR_KEY);
    expect(html).not.toContain('Shall we all produce');
    for (const word of ['huddle', 'Huddle', 'prediction', 'Prediction', 'reflection', 'joinCode']) {
      expect(html).not.toContain(word);
    }
  });

  it('has no controls on it at all', () => {
    show({ phase: 'YEAR_OPEN' });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  });

  it('asks for the proper link rather than connecting without a key', () => {
    // The projector key is the only thing that opens this screen, so a link
    // without it explains itself and never opens a socket.
    render(
      <MemoryRouter initialEntries={['/projector/session-demo']}>
        <Routes>
          <Route path="/projector/:id" element={<ProjectorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText('This screen needs the projector link from the instructor’s dashboard.'),
    ).toBeInTheDocument();
  });
});
