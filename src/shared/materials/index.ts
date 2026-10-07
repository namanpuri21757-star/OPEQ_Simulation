/**
 * The five classroom materials (SPEC 8.4 Materials).
 *
 * One list, used twice: `npm run benchmarks` writes each one to
 * docs/materials/<slug>.md, and /instructor/materials renders the same
 * documents for a teacher to read or print from the running session's settings.
 */

import type { Settings } from '../settings.js';
import { briefingDoc } from './briefing.js';
import { debriefGuideDoc } from './debriefGuide.js';
import { privacyDoc } from './privacy.js';
import { roleCardsDoc } from './roleCards.js';
import { runbookDoc } from './runbook.js';
import type { MaterialDoc } from './types.js';

export * from './types.js';
export { markdownFor, MATERIALS_NOTE } from './markdown.js';
export { agendaMinutes, agendaRows, type AgendaRow } from './agenda.js';

/** Every material, in the order a teacher meets them. */
export function materialsFor(settings: Settings): MaterialDoc[] {
  return [
    briefingDoc(settings),
    roleCardsDoc(settings),
    runbookDoc(),
    debriefGuideDoc(settings),
    privacyDoc(),
  ];
}

export function materialFor(settings: Settings, slug: string): MaterialDoc | undefined {
  return materialsFor(settings).find((doc) => doc.slug === slug);
}
