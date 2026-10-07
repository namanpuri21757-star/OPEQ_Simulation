import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  INSTRUCTOR_KEY,
  instructorView,
  PROJECTOR_KEY,
} from '../../../tests/support/instructorView';
import { TeamCards } from './CardsPage';

describe('the printable team cards', () => {
  it('has one card per team, with every join code', () => {
    const view = instructorView({ worldCount: 3 });
    render(<TeamCards view={view} />);

    const cards = screen.getAllByRole('listitem');
    expect(cards).toHaveLength(9);
    for (const team of view.teams) {
      expect(screen.getByText(team.joinCode)).toBeInTheDocument();
    }
  });

  it('sorts the cards by world and then by country, the way the room is laid out', () => {
    render(<TeamCards view={instructorView({ worldCount: 2 })} />);

    const worlds = screen.getAllByRole('listitem').map((card) => card.textContent ?? '');
    expect(worlds[0]).toContain('World 1 - country A');
    expect(worlds[1]).toContain('World 1 - country B');
    expect(worlds[2]).toContain('World 1 - country C');
    expect(worlds[3]).toContain('World 2 - country A');
  });

  it('gives each card its country, its world and a scannable link', () => {
    render(<TeamCards view={instructorView({ worldCount: 1 })} />);

    const card = screen.getAllByRole('listitem')[0];
    expect(card).toBeDefined();
    const inCard = within(card as HTMLElement);
    expect(inCard.getByText('Ardonia')).toBeInTheDocument();
    expect(inCard.getByText('World 1 - country A')).toBeInTheDocument();
    expect(inCard.getByText(/\/join\/W1AXYZ$/)).toBeInTheDocument();
    // The QR code is drawn on this computer, so it works with no internet.
    expect(inCard.getByRole('img', { name: 'Join link for World 1 - Ardonia (A)' })).toBeVisible();
  });

  it('carries no key and no other team’s code', () => {
    const view = instructorView({ worldCount: 3 });
    const { container } = render(<TeamCards view={view} />);
    const text = container.innerHTML;

    expect(text).not.toContain(INSTRUCTOR_KEY);
    expect(text).not.toContain(PROJECTOR_KEY);
    expect(text).not.toContain(view.seed);

    // Each card holds one code, so a cut-up sheet never leaks a neighbour's.
    for (const card of screen.getAllByRole('listitem')) {
      const found = view.teams.filter((team) => (card.textContent ?? '').includes(team.joinCode));
      expect(found).toHaveLength(1);
    }
  });
});
