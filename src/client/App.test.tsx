import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe('routes', () => {
  it('shows the app name on the landing page', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Crude Accord' })).toBeInTheDocument();
  });

  it.each([
    ['/join', 'Join a team'],
    ['/join/ABCDEF', 'Join a team'],
    ['/team', 'Team Terminal'],
    ['/instructor', 'Instructor Dashboard'],
    ['/check', 'Network check'],
  ])('renders %s', (path, heading) => {
    renderAt(path);
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
  });

  it('passes the session id through to the projector route', () => {
    renderAt('/projector/abc123');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Projector for session abc123' }),
    ).toBeInTheDocument();
  });
});
