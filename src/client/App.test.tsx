import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { clearInstructor, clearTerminal, writeTerminal } from './net';
import Landing from './pages/Landing';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearTerminal(window.localStorage);
  clearInstructor(window.localStorage);
  // Nothing in these tests should reach a server; the join screens are covered
  // on their own, with a connection they can see.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ sessions: [] }) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearTerminal(window.localStorage);
  clearInstructor(window.localStorage);
});

describe('the landing page', () => {
  it('offers exactly two ways in', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Crude Accord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'This is a team computer' })).toHaveAttribute(
      'href',
      '/join',
    );
    expect(screen.getByRole('link', { name: 'I am the instructor' })).toHaveAttribute(
      'href',
      '/instructor',
    );
  });

  it('sends a computer that already has a country back to its own screen', () => {
    writeTerminal(window.localStorage, {
      sessionId: 'session-demo',
      teamId: 'world-2-B',
      token: 'a-token-long-enough-to-store',
      label: 'World 2 - Borvia (B)',
    });

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/team" element={<p>the team screen</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('the team screen')).toBeInTheDocument();
  });
});

describe('routes', () => {
  it('offers the instructor a new game when this computer has none', () => {
    renderAt('/instructor');
    expect(screen.getByRole('heading', { level: 2, name: 'Start a new game' })).toBeInTheDocument();
  });

  it('sends the cards page back to the dashboard when there is no session yet', () => {
    renderAt('/instructor/cards');
    expect(screen.getByText(/Open your dashboard first/)).toBeInTheDocument();
  });

  it('opens the network check', async () => {
    renderAt('/check');
    expect(screen.getByRole('heading', { level: 2, name: 'Network check' })).toBeInTheDocument();
    expect(
      await screen.findByText(
        'No game is open on this computer yet. Ask your teacher to start one.',
      ),
    ).toBeInTheDocument();
  });

  it('asks the projector for its own link when the key is missing', () => {
    renderAt('/projector/abc123');
    expect(
      screen.getByText('This screen needs the projector link from the instructor’s dashboard.'),
    ).toBeInTheDocument();
  });

  it('has a page for an address that does not exist', () => {
    renderAt('/nowhere');
    expect(
      screen.getByText('That page does not exist. Try the address your teacher gave you.'),
    ).toBeInTheDocument();
  });

  it('says plainly when no game is open yet', async () => {
    renderAt('/join');
    expect(
      await screen.findByText(
        'No game is open on this computer yet. Ask your teacher to start one.',
      ),
    ).toBeInTheDocument();
  });
});
