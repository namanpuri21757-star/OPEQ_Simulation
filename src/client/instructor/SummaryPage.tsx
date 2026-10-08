import { useMemo } from 'react';
import { APP_NAME } from '@shared/constants';
import { DEBRIEF_SCREENS } from '@shared/debrief';
import type { InstructorView } from '@shared/views';
import { RoleConnection, browserStore, readInstructor, useView, type KeyValueStore } from '../net';
import { Button } from '../ui';
import { DebriefScreenView } from '../debrief';
import { useOpenChartData } from '../debrief/useOpenChartData';

/**
 * /instructor/summary (SPEC 8.4 Exports): the whole debrief on one long page,
 * laid out to print.
 *
 * It is the paper version of the five screens: every world in turn, with the
 * same titles and the same numbers. Teachers hand this to a colleague, or keep
 * it with the lesson plan, and it needs no spreadsheet to read.
 */
export interface SummaryPageProps {
  store?: KeyValueStore;
}

export default function SummaryPage({ store }: SummaryPageProps) {
  const keyValue = useMemo(() => store ?? browserStore(), [store]);
  const saved = useMemo(() => readInstructor(keyValue), [keyValue]);

  if (saved === null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">
          Open your dashboard first, then come back here. The summary is built from the game running
          on this computer.
        </p>
      </main>
    );
  }

  return (
    <RoleConnection sessionId={saved.sessionId} role="instructor" authKey={saved.instructorKey}>
      <Summary />
    </RoleConnection>
  );
}

/** Only the route reads the context; the page itself takes a view. */
function Summary() {
  const { view } = useView<InstructorView>();
  useOpenChartData();

  if (view === null || view.kind !== 'instructor') {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">Getting the results...</p>
      </main>
    );
  }

  const debrief = view.debrief;
  if (debrief === null) {
    return (
      <main className="sheet">
        <h1>{APP_NAME}</h1>
        <p role="status">
          The summary is ready once the game has ended. Go back to the dashboard and finish the game
          first.
        </p>
      </main>
    );
  }

  return (
    <main className="sheet page-summary">
      <header className="materials-toolbar">
        <div>
          <h1>Debrief summary</h1>
          <p className="note">{`Session ${view.sessionId} - ${String(view.worlds.length)} worlds, ${String(debrief.years.length)} scored years`}</p>
        </div>
        <Button
          onClick={() => {
            window.print();
          }}
        >
          Print
        </Button>
      </header>

      {DEBRIEF_SCREENS.map((screen) =>
        // One World Detail per world, so nothing is left out of the paper copy.
        screen === 'worldDetail' ? (
          debrief.worlds.map((world) => (
            <section className="summary-part" key={`detail-${String(world.worldNumber)}`}>
              <DebriefScreenView
                screen="worldDetail"
                debrief={debrief}
                worldNumber={world.worldNumber}
              />
            </section>
          ))
        ) : (
          <section className="summary-part" key={screen}>
            <DebriefScreenView screen={screen} debrief={debrief} worldNumber={null} />
          </section>
        ),
      )}
    </main>
  );
}
