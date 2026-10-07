import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Countdown, mmss } from './Countdown';

const NOW = 1_700_000_000_000;
const serverNow = () => NOW;

function renderWithSecondsLeft(seconds: number) {
  return render(
    <Countdown
      deadline={NOW + seconds * 1000}
      remainingMs={seconds * 1000}
      paused={false}
      serverNow={serverNow}
    />,
  );
}

afterEach(() => {
  vi.useRealTimers();
});

describe('mmss', () => {
  it.each([
    [0, '0:00'],
    [999, '0:01'],
    [9000, '0:09'],
    [65_000, '1:05'],
    [150_000, '2:30'],
    [600_000, '10:00'],
  ])('shows %i ms as %s', (ms, text) => {
    expect(mmss(ms)).toBe(text);
  });
});

describe('Countdown', () => {
  it('counts down from the server deadline, not this computer’s clock', () => {
    renderWithSecondsLeft(150);
    expect(screen.getByText('2:30')).toBeInTheDocument();
  });

  it('says nothing before the first milestone', () => {
    renderWithSecondsLeft(90);
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it.each([
    [60, 'One minute left.'],
    [45, 'One minute left.'],
    [30, '30 seconds left.'],
    [22, '30 seconds left.'],
    [10, '10 seconds left.'],
    [3, '10 seconds left.'],
  ])('announces %i seconds left as "%s"', (seconds, said) => {
    renderWithSecondsLeft(seconds);
    expect(screen.getByRole('status')).toHaveTextContent(said);
  });

  it('keeps one announcement while the seconds run down inside a milestone', () => {
    const { rerender } = renderWithSecondsLeft(59);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('One minute left.');

    // The live region only speaks when its text changes, so an unchanged
    // sentence between 59 and 31 seconds is what "once each" means here.
    rerender(
      <Countdown
        deadline={NOW + 31_000}
        remainingMs={31_000}
        paused={false}
        serverNow={serverNow}
      />,
    );
    expect(status).toHaveTextContent('One minute left.');
  });

  it('says Time is up when the timer runs out', () => {
    renderWithSecondsLeft(0);
    expect(screen.getByText('Time is up')).toBeInTheDocument();
  });

  it('says who paused it, and stops counting', () => {
    render(<Countdown deadline={null} remainingMs={45_000} paused serverNow={serverNow} />);
    expect(screen.getByText('Paused by your teacher')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Paused by your teacher.');
  });

  it('repaints while the clock runs', () => {
    vi.useFakeTimers();
    let now = NOW;
    render(
      <Countdown
        deadline={NOW + 10_000}
        remainingMs={10_000}
        paused={false}
        serverNow={() => now}
      />,
    );
    expect(screen.getByText('0:10')).toBeInTheDocument();

    now += 4000;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText('0:06')).toBeInTheDocument();
  });
});
