import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { playedDebrief } from '../../../tests/support/debrief';
import { instructorView } from '../../../tests/support/instructorView';
import { DebriefPanel } from './DebriefPanel';

/**
 * The dashboard's debrief panel.
 *
 * Two things are worth a test: the Show on projector button sends the screen the
 * teacher is looking at, with the world when the screen needs one, and the
 * evidence link on a question moves the panel to the right screen.
 */
const debrief = playedDebrief();

function renderPanel() {
  const send = vi.fn().mockResolvedValue({ ok: true, commandId: 'c1', version: 2 });
  const onSaid = vi.fn();
  render(
    <DebriefPanel
      view={instructorView({ worldCount: 2, phase: 'ENDED', debrief })}
      send={send}
      onSaid={onSaid}
    />,
  );
  return { send, onSaid, user: userEvent.setup() };
}

describe('the debrief panel', () => {
  it('opens on the world comparison', () => {
    renderPanel();
    expect(screen.getByRole('heading', { level: 2, name: 'Debrief' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: debrief.titles.comparison }),
    ).toBeInTheDocument();
  });

  it('sends the screen the teacher is looking at to the projector', async () => {
    const { send, user } = renderPanel();
    await user.click(screen.getByRole('button', { name: 'Show on projector' }));
    expect(send).toHaveBeenCalledWith('setProjectorScreen', { screen: 'worldComparison' });
  });

  it('sends the chosen world with the world detail screen', async () => {
    const { send, user } = renderPanel();
    await user.click(screen.getByRole('tab', { name: 'World detail' }));
    await user.click(screen.getByRole('tab', { name: 'World 2' }));
    await user.click(screen.getByRole('button', { name: 'Show on projector' }));
    expect(send).toHaveBeenCalledWith('setProjectorScreen', {
      screen: 'worldDetail',
      worldNumber: 2,
    });
    expect(screen.getByRole('heading', { level: 2, name: /World 2 kept/ })).toBeInTheDocument();
  });

  it('puts the projector back to the room screen', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true, commandId: 'c1', version: 2 });
    render(
      <DebriefPanel
        view={instructorView({
          worldCount: 2,
          phase: 'ENDED',
          debrief,
          projectorScreen: 'leaderboard',
        })}
        send={send}
        onSaid={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('The projector is showing Leaderboard.');
    await userEvent.setup().click(screen.getByRole('button', { name: /Back to the room screen/ }));
    expect(send).toHaveBeenCalledWith('setProjectorScreen', { screen: 'auto' });
  });

  it('says which world the projector is showing', () => {
    render(
      <DebriefPanel
        view={instructorView({
          worldCount: 2,
          phase: 'ENDED',
          debrief,
          projectorScreen: 'worldDetail',
          projectorWorldNumber: 2,
        })}
        send={vi.fn()}
        onSaid={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'The projector is showing World detail for World 2.',
    );
  });

  it('moves to the evidence when a question asks for it', async () => {
    const { user } = renderPanel();
    await user.click(screen.getByRole('tab', { name: 'Questions' }));
    await user.click(screen.getByRole('button', { name: /Show evidence: the best response/ }));
    expect(
      screen.getByRole('heading', { level: 2, name: debrief.titles.gameTheory }),
    ).toBeInTheDocument();
  });

  it('says the debrief is not ready before the game ends', () => {
    render(
      <DebriefPanel
        view={instructorView({ phase: 'YEAR_OPEN' })}
        send={vi.fn()}
        onSaid={vi.fn()}
      />,
    );
    expect(screen.getByText(/opens when the game ends/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show on projector' })).toBeNull();
  });
});
