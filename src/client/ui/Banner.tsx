import type { ReactNode } from 'react';

/**
 * A full-width notice: reconnecting, muted, the final year, time is up.
 *
 * "alert" is read out straight away, which is right for something that changes
 * what the group should do now. Everything else waits its turn, so a screen
 * reader is not interrupted mid-sentence.
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
      className={`banner banner-${tone}`}
      role={tone === 'alert' ? 'alert' : 'status'}
      aria-live={tone === 'alert' ? 'assertive' : 'polite'}
    >
      {title !== undefined && <strong className="banner-title">{title}</strong>}
      <span>{children}</span>
    </div>
  );
}
