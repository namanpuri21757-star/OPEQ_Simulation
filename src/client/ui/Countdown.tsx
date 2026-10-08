import { useEffect, useState } from 'react';

/**
 * The clock every year runs on (SPEC 8.3).
 *
 * The time left is worked out from the server's deadline and this computer's
 * offset from the server clock, so a laptop whose clock is ten minutes out still
 * shows the same number as the projector.
 *
 * Nothing about the time is kept in state: the interval only asks for a repaint,
 * and the time and the spoken milestone are both worked out while rendering. That
 * is what makes the milestones say themselves exactly once - the live region only
 * speaks when its text changes, and the text only changes at 60, 30 and 10
 * seconds (SPEC section 9).
 */
/** Smallest first, so the nearest milestone is the one that is said. */
const MILESTONES = [10, 30, 60];
const TICK_MS = 250;

export interface CountdownProps {
  /** When the phase ends, on the server's clock. null when there is no timer. */
  deadline: number | null;
  /** What the server last said was left. Used while paused. */
  remainingMs: number | null;
  paused: boolean;
  /** The server's clock as this client knows it. */
  serverNow(): number;
  /** Shown instead of a time when the timer has run out. */
  closedLabel?: string;
}

export function mmss(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${seconds < 10 ? '0' : ''}${String(seconds)}`;
}

function sayLeft(seconds: number): string {
  return seconds === 60 ? 'One minute left.' : `${String(seconds)} seconds left.`;
}

export function Countdown({
  deadline,
  remainingMs,
  paused,
  serverNow,
  closedLabel = 'Time is up',
}: CountdownProps) {
  const [, repaint] = useState(0);

  useEffect(() => {
    if (paused || deadline === null) return;
    const timer = setInterval(() => repaint((n) => n + 1), TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [paused, deadline]);

  const ms = paused || deadline === null ? remainingMs : Math.max(0, deadline - serverNow());
  const seconds = ms === null ? null : Math.ceil(ms / 1000);
  const milestone =
    paused || seconds === null || seconds <= 0
      ? null
      : (MILESTONES.find((mark) => seconds <= mark) ?? null);

  const text = ms === null ? '--:--' : ms <= 0 ? closedLabel : mmss(ms);
  const low = ms !== null && ms > 0 && ms <= 30000;

  return (
    <span className="countdown">
      <span className="visually-hidden">Time left</span>
      <span className={`countdown-time${low ? ' countdown-low' : ''}`}>
        {paused ? 'Paused by your teacher' : text}
      </span>
      <span className="visually-hidden" role="status" aria-live="polite">
        {paused ? 'Paused by your teacher.' : milestone === null ? '' : sayLeft(milestone)}
      </span>
    </span>
  );
}
