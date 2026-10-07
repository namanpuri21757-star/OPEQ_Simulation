/**
 * Two small things every dashboard control needs.
 *
 * `guardsFor` reads expectedPhase and expectedYear off the view the teacher is
 * actually looking at. The connection would fill the same two in by itself, but
 * passing them explicitly is what makes "this control sends the right guards"
 * something a test can check, and what stops a control borrowing the guards from
 * a view that arrived while the dialog was open.
 *
 * `looseSend` exists for exactly one caller: the suggested-action button, where
 * the server chose the command name and its payload together and the view can
 * only carry the name as a string.
 */

import type { Ack, CommandType } from '@shared/protocol';
import type { InstructorView } from '@shared/views';
import type { SendCommand, SendOptions } from '../net';

export interface Guards {
  expectedPhase: InstructorView['phase'];
  expectedYear: number;
}

export function guardsFor(view: InstructorView): Guards {
  return { expectedPhase: view.phase, expectedYear: view.year };
}

/**
 * A sender that takes a command name worked out at runtime.
 *
 * Safe here only because the pairing comes from nextSuggestedAction on the
 * server, which builds the name and the payload in the same breath; the server
 * then validates the payload against that type anyway, so a mismatch would be a
 * refused ack and not a wrong year.
 */
export type LooseSend = (
  type: CommandType,
  payload: Record<string, unknown>,
  options?: SendOptions,
) => Promise<Ack>;

export function looseSend(send: SendCommand): LooseSend {
  return send as unknown as LooseSend;
}
