/**
 * How a debrief chart tells its lines apart.
 *
 * Every series gets a marker shape and a dash pattern as well as a colour, so a
 * chart still reads on a projector at the back of the room, printed in black and
 * white, or by someone who does not see colour differences (SPEC section 9).
 */

import type { ChartMarker } from '../ui';
import type { DebriefMarkerKind } from '@shared/debrief';

const MARKERS: ChartMarker[] = ['circle', 'square', 'triangle', 'diamond', 'plus', 'bar'];
const DASHES: Array<string | undefined> = [undefined, '6 4', '2 3', '8 3 2 3', '1 3', '10 4'];

export function markerFor(index: number): ChartMarker {
  return MARKERS[index % MARKERS.length] ?? 'circle';
}

export function dashFor(index: number): string | undefined {
  return DASHES[index % DASHES.length];
}

/** The style for one series: spread into a ChartSeries. */
export function styleFor(index: number): { marker: ChartMarker; dash?: string } {
  const dash = dashFor(index);
  return dash === undefined ? { marker: markerFor(index) } : { marker: markerFor(index), dash };
}

/** A word for each kind of labelled moment, used in the chart's own list. */
export const MARKER_WORDS: Record<DebriefMarkerKind, string> = {
  chat: 'Chat window',
  summit: 'Summit',
  newProducer: 'New producer',
  demand: 'Demand change',
  finalYear: 'Final year',
};
