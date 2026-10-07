import { APP_NAME } from '@shared/constants';
import type { GoneMessage } from '@shared/protocol';
import { Button } from '../ui';

/**
 * This computer has lost its country (SPEC 8.3): another computer took it over,
 * the teacher released it, a takeover was turned down, or the game was closed.
 *
 * The server writes the sentence, so the reason a student reads is the reason the
 * server acted on. There is exactly one thing to do next.
 */
export interface TakeoverScreenProps {
  gone: GoneMessage;
  onJoinAgain(): void;
}

export function TakeoverScreen({ gone, onJoinAgain }: TakeoverScreenProps) {
  return (
    <main className="page">
      <h1>{APP_NAME}</h1>
      <section className="panel takeover">
        <h2>{gone.reason === 'takenOver' ? 'This team moved to another computer' : 'Paused'}</h2>
        <p className="lead">{gone.message}</p>
        <p className="hint">
          Nothing is lost. Everything your group sent is saved on your teacher&rsquo;s computer.
        </p>
        {gone.reason !== 'deleted' && (
          <Button tone="primary" size="large" onClick={onJoinAgain}>
            Join again with our code
          </Button>
        )}
      </section>
    </main>
  );
}
