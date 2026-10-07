import type { ButtonHTMLAttributes, ReactNode } from 'react';

/**
 * One button, three jobs: the main action, a secondary action, and a quiet one.
 *
 * Size "large" is for the one main action on a screen (SPEC 8.1), so a student
 * can see from across the room where to click.
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
  const classes = ['button', `button-${tone}`, size === 'large' ? 'button-large' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  );
}
