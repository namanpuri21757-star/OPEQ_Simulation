import { DEBRIEF_SCREENS, type DebriefData, type DebriefScreen } from '@shared/debrief';
import { GameTheory } from './GameTheory';
import { Leaderboard } from './Leaderboard';
import { Questions } from './Questions';
import { WorldComparison } from './WorldComparison';
import { WorldDetail } from './WorldDetail';

export { GameTheory } from './GameTheory';
export { Leaderboard } from './Leaderboard';
export { Questions } from './Questions';
export { WorldComparison } from './WorldComparison';
export { WorldDetail } from './WorldDetail';
export { styleFor, markerFor, dashFor } from './series';
export { useOpenChartData } from './useOpenChartData';

/** What each debrief screen is called on a button and a tab. */
export const DEBRIEF_TITLES: Record<DebriefScreen, string> = {
  worldComparison: 'World comparison',
  worldDetail: 'World detail',
  leaderboard: 'Leaderboard',
  gameTheory: 'Game theory',
  questions: 'Questions',
};

/** Whether a projector screen name is one of the debrief screens. */
export function isDebriefScreenName(screen: string): screen is DebriefScreen {
  return (DEBRIEF_SCREENS as readonly string[]).includes(screen);
}

/** The title of a debrief screen, or undefined for a screen that is not one. */
export function debriefTitleOf(screen: string): string | undefined {
  return isDebriefScreenName(screen) ? DEBRIEF_TITLES[screen] : undefined;
}

/**
 * One debrief screen, chosen by name.
 *
 * The instructor dashboard and the projector both render this, from the same
 * data, so what the room sees is exactly what the teacher sent (SPEC 8.5).
 */
export interface DebriefScreenViewProps {
  screen: DebriefScreen;
  debrief: DebriefData;
  worldNumber: number | null;
  onShowEvidence?: (screen: DebriefScreen) => void;
}

export function DebriefScreenView({
  screen,
  debrief,
  worldNumber,
  onShowEvidence,
}: DebriefScreenViewProps) {
  switch (screen) {
    case 'worldComparison':
      return <WorldComparison debrief={debrief} />;
    case 'worldDetail':
      return <WorldDetail debrief={debrief} worldNumber={worldNumber} />;
    case 'leaderboard':
      return <Leaderboard debrief={debrief} />;
    case 'gameTheory':
      return <GameTheory debrief={debrief} />;
    case 'questions':
      return <Questions debrief={debrief} {...(onShowEvidence ? { onShowEvidence } : {})} />;
    default: {
      const never: never = screen;
      return <p>{`Unknown screen ${String(never)}`}</p>;
    }
  }
}
