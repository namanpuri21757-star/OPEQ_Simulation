import { useEffect, useState } from 'react';
import { mmss } from './Countdown';

/**
 * "Year 3 starts in 0:08": the pause between rounds when the game moves on by
 * itself. The moment comes from the server; this only repaints.
 */
export interface StartsInProps {
  /** When the next year opens, on the server's clock. null draws nothing. */
  at: number | null;
  /** What starts, such as "Year 3". */
  what: string;
  serverNow?: (() => number) | undefined;
  className?: string;
}

export function StartsIn({ at, what, serverNow = Date.now, className = 'note' }: StartsInProps) {
  const [, repaint] = useState(0);
  useEffect(() => {
    if (at === null) return;
    const timer = setInterval(() => repaint((n) => n + 1), 250);
    return () => {
      clearInterval(timer);
    };
  }, [at]);
  if (at === null) return null;
  const left = Math.max(0, at - serverNow());
  return (
    <p className={className}>
      {left > 0 ? `${what} starts by itself in ${mmss(left)}.` : `${what} is starting...`}
    </p>
  );
}
