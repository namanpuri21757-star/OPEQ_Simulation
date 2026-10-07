import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

/**
 * The in-app confirmation. Never a browser alert (SPEC 8.4), because a browser
 * dialog stops the countdown from being read and looks like a warning when it
 * is really just a question.
 *
 * It traps Tab inside itself, closes on Escape, moves focus in when it opens and
 * gives focus back to whatever opened it when it closes.
 */
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DialogProps {
  title: string;
  /** Called by Escape and by the Cancel button. */
  onClose(): void;
  children: ReactNode;
  /** The buttons along the bottom. The first one is focused when it opens. */
  footer?: ReactNode;
}

export function Dialog({ title, onClose, children, footer }: DialogProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = box.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    (first ?? box.current)?.focus();
    return () => {
      previous?.focus();
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;

    // Wrapping by hand is what keeps focus inside: without it, Tab from the last
    // button lands on the browser's own toolbar and the student is lost.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" onKeyDown={onKeyDown}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={box}
        tabIndex={-1}
      >
        <h2 className="dialog-title" id={titleId}>
          {title}
        </h2>
        <div className="dialog-body">{children}</div>
        {footer !== undefined && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}
