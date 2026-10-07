import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import {
  INSTRUCTOR_KEY,
  PROJECTOR_KEY,
  projectorView,
} from '../../../tests/support/instructorView';
import { message, NOW, timing } from '../../../tests/support/teamView';
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
  it('shows the year, the phase and the clock', () => {
    show({ phase: 'YEAR_OPEN', year: 5 });

    expect(screen.getByText('Year 5')).toBeInTheDocument();
    expect(screen.getByText('Decide now')).toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('labels the practice year as PRACTICE', () => {
    show({ phase: 'PRACTICE_OPEN', year: 0 });
    expect(screen.getByText('PRACTICE')).toBeInTheDocument();
  });

  it('shows the latest announcement', () => {
    show({
      announcements: [
        message({ kind: 'announcement', letter: null, countryName: null, text: 'Two minutes.' }),
        message({
          messageId: 'm2',
          kind: 'announcement',
          letter: null,
          countryName: null,
          text: 'One minute.',
        }),
      ],
    });

    expect(screen.getByText('One minute.')).toBeInTheDocument();
    expect(screen.queryByText('Two minutes.')).toBeNull();
  });

  it('sends the Envoys to the meeting point during a summit', () => {
    show({ phase: 'BETWEEN', between: { kind: 'summit', afterYear: 7, seconds: 300 } });
    expect(screen.getByText('Envoys: go to the meeting point.')).toBeInTheDocument();
  });
});

describe('the projector at a reveal', () => {
  it('shows each world’s price when prices are allowed', () => {
    show({
      phase: 'YEAR_REVEAL',
      worldCount: 2,
      worlds: [
        { worldNumber: 1, priceCents: 3553, year: 5 },
        { worldNumber: 2, priceCents: 1825, year: 5 },
      ],
    });

    expect(screen.getByText('$35.53')).toBeInTheDocument();
    expect(screen.getByText('$18.25')).toBeInTheDocument();
  });

  it('shows no price when the instructor has turned prices off', () => {
    // With projectorShowsPrices off the server never fills the price in, so the
    // screen has nothing to show and says nothing about it.
    show({
      phase: 'YEAR_REVEAL',
      showsPrices: false,
      worlds: [{ worldNumber: 1, priceCents: null, year: null }],
    });

    expect(screen.queryByRole('heading', { name: "This year's price" })).toBeNull();
  });
});

describe('what the projector must never show', () => {
  it('carries no chat, no team-private data and no key', () => {
    const { container } = render(
      <ProjectorScreen
        view={projectorView({
          phase: 'YEAR_REVEAL',
          timing: timing(),
          announcements: [
            message({ kind: 'announcement', letter: null, countryName: null, text: 'Well done.' }),
          ],
          worlds: [{ worldNumber: 1, priceCents: 3553, year: 5 }],
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
