import { useCallback, useEffect, useState } from 'react';

/**
 * Somewhere to put one short sentence: "Saved", or the server's own wording for
 * a refusal. Written out as its own type because every panel takes one.
 */
export type Say = (text: string, tone: 'good' | 'bad') => void;

/**
 * A short message that answers something the group just did.
 *
 * It does not steal focus and it does not block the screen, because the timer is
 * usually running while it is up.
 */
export interface ToastMessage {
  text: string;
  tone: 'good' | 'bad';
}

export function Toast({ message }: { message: ToastMessage | null }) {
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message !== null && <div className={`toast toast-${message.tone}`}>{message.text}</div>}
    </div>
  );
}

/** Holds the latest message and clears it after a few seconds. */
export function useToast(clearAfterMs = 6000) {
  const [message, setMessage] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(() => setMessage(null), clearAfterMs);
    return () => {
      clearTimeout(timer);
    };
  }, [message, clearAfterMs]);

  const say = useCallback((text: string, tone: ToastMessage['tone'] = 'good') => {
    setMessage({ text, tone });
  }, []);

  return { message, say };
}
