import { BRIEFING_SLIDES } from '@shared/state';
import type { InstructorView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, type Say } from '../ui';

/**
 * The briefing, driven from here (SPEC 8.3 and 8.4).
 *
 * Every terminal and the projector show whichever screen this says, so the room
 * is always on the same one. Going back is as easy as going forward, because the
 * question students ask is usually about the screen before.
 */
const SLIDE_NAMES = ['The story', 'How the price works', 'Your jobs', 'How a year works'];

export interface BriefingControlProps {
  view: InstructorView;
  send: SendCommand;
  onSaid: Say;
}

export function BriefingControl({ view, send, onSaid }: BriefingControlProps) {
  const slide = view.briefingSlide;

  const go = async (to: number) => {
    const ack = await send('setBriefingSlide', { slide: to });
    if (!ack.ok) onSaid(ack.message, 'bad');
  };

  return (
    <section className="panel briefing-control" aria-labelledby="briefing-heading">
      <h2 id="briefing-heading">Briefing</h2>
      <p className="briefing-where" role="status">
        {`Screen ${String(slide + 1)} of ${String(BRIEFING_SLIDES)}: ${SLIDE_NAMES[slide] ?? ''}`}
      </p>
      <p className="hint">Every terminal and the projector are showing this screen.</p>
      <div className="row">
        <Button onClick={() => void go(slide - 1)} disabled={slide <= 0}>
          Back a screen
        </Button>
        <Button onClick={() => void go(slide + 1)} disabled={slide >= BRIEFING_SLIDES - 1}>
          Forward a screen
        </Button>
      </div>
    </section>
  );
}
