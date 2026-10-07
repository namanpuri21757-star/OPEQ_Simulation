import { useEffect } from 'react';

/**
 * The two keys a teacher uses without looking (SPEC 8.4 and the design note:
 * N for the next step, Space to pause and resume).
 *
 * Both are ignored while the focus is in a field or a dialog is open, because a
 * teacher typing an announcement presses the space bar all the time, and a key
 * that works "except sometimes" is worse than no key at all. N still opens a
 * confirmation rather than acting, so a stray keypress cannot close a year.
 */
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (TYPING.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  // A dialog takes the keyboard over while it is up.
  return target.closest('[role="dialog"]') !== null;
}

export interface Shortcuts {
  /** N: ask about the suggested action. */
  onNext(): void;
  /** Space: pause, or resume if already paused. */
  onPauseOrResume(): void;
  enabled?: boolean;
}

export function useShortcuts({ onNext, onPauseOrResume, enabled = true }: Shortcuts): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        onPauseOrResume();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onNext, onPauseOrResume, enabled]);
}
