import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSettings } from '@shared/settings';
import { Materials } from './MaterialsPage';

/**
 * /instructor/materials.
 *
 * The page is only worth testing for two things: it shows all five handouts
 * from the settings it was given, and it can show one on its own so a teacher
 * can print just the role cards.
 */
function renderMaterials(settings = DEFAULT_SETTINGS, live = true, path = '/instructor/materials') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Materials settings={settings} live={live} />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('the materials page', () => {
  it('shows all five handouts', () => {
    renderMaterials();
    for (const title of [
      'Your country, your oil, your call',
      'Role cards',
      'Instructor runbook',
      'Debrief guide',
      'What this activity records',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
  });

  it('works the numbers out from the settings it was given', () => {
    renderMaterials(parseSettings({ a: 50, b: 0.5, cost: 2, startingOutput: 20, capacity: 40 }));
    expect(screen.getByText('price = 50 - 0.5 x total supply')).toBeInTheDocument();
    expect(screen.getByText('price = 50 - 0.5 x 60.0 = $20.00')).toBeInTheDocument();
  });

  it('says whether the numbers came from a running game', () => {
    renderMaterials(DEFAULT_SETTINGS, false);
    expect(screen.getByText(/No game is open on this computer/)).toBeInTheDocument();
  });

  it('shows one handout on its own when asked', () => {
    renderMaterials(DEFAULT_SETTINGS, true, '/instructor/materials?doc=role-cards');
    expect(screen.getByRole('heading', { level: 2, name: 'Role cards' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Debrief guide' })).toBeNull();
  });

  it('switches to one handout when its button is pressed', async () => {
    const user = renderMaterials();
    await user.click(screen.getByRole('button', { name: 'Debrief guide' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Debrief guide' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Role cards' })).toBeNull();
  });

  it('says so plainly when the name in the address is not a handout', () => {
    renderMaterials(DEFAULT_SETTINGS, true, '/instructor/materials?doc=homework');
    expect(screen.getByRole('status').textContent).toContain('no material called "homework"');
  });

  it('turns every kind of block into real markup', () => {
    renderMaterials(DEFAULT_SETTINGS, true, '/instructor/materials?doc=instructor-runbook');
    expect(screen.getByRole('heading', { level: 3, name: 'Before the bell' })).toBeInTheDocument();
    expect(
      screen.getByRole('table', { name: /Agenda for the 75 minutes lesson/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('list').length).toBeGreaterThan(0);
  });
});
