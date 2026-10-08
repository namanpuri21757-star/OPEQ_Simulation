import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * One button, three strengths.
 *
 * There is exactly one `primary` button on a screen and it carries a ▸, so a
 * teacher glancing at the dashboard mid-sentence can find the next step without
 * reading anything. Everything else is outlined, and `quiet` is for a link-like
 * action that must not compete.
 *
 * An action that cannot be used right now is not rendered at all rather than
 * rendered greyed out, so `disabled` here only ever means "this click is already
 * in flight" (SPEC 8.0).
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'primary' | 'secondary' | 'quiet';
  size?: 'normal' | 'large';
  children: ReactNode;
}

export function Button({
  tone = 'secondary',
  size = 'normal',
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = ['btn', `btn-${tone}`, size === 'large' ? 'btn-large' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      <span>{children}</span>
      {tone === 'primary' && <span aria-hidden="true">&#9656;</span>}
    </button>
  );
}
