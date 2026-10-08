import type { ReactNode } from 'react';

/**
 * A full-width ruled notice: reconnecting, muted, the final year.
 *
 * "alert" is read out straight away and is ruled in red, which is right for
 * something that changes what to do now. Everything else waits its turn, so a
 * screen reader is not interrupted mid-sentence. The colour never travels
 * alone: the title says what kind of notice it is (SPEC section 9).
 */
export interface BannerProps {
  tone?: 'info' | 'warning' | 'alert';
  children: ReactNode;
  /** A short label read before the text, such as "Final year". */
  title?: string;
}

export function Banner({ tone = 'info', title, children }: BannerProps) {
  return (
    <div
      className={`notice${tone === 'alert' ? ' notice-alert' : ''}`}
      role={tone === 'alert' ? 'alert' : 'status'}
      aria-live={tone === 'alert' ? 'assertive' : 'polite'}
    >
      {title !== undefined && <strong className="notice-title">{title}</strong>}
      <span>{children}</span>
    </div>
  );
}
