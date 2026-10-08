import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Banner, type Say } from '../ui';
import { DecisionPanel } from './DecisionPanel';
import { HistoryPanel } from './HistoryPanel';
import { LastYearPanel } from './LastYearPanel';
import { MessagesPanel } from './MessagesPanel';

/**
 * An open year (SPEC 8.3).
 *
 * Left column: the decision, then what happened last year, then the table and
 * the chart. Right column: messages. The order answers the questions a group
 * asks in the order it asks them - what do we do, what happened last time, what
 * has happened so far, what are the others saying - and nothing else is on the
 * screen at all.
 */
export interface YearScreenProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
  serverNow?: (() => number) | undefined;
}

export function YearScreen({ view, send, onSaid, serverNow }: YearScreenProps) {
  return (
    <>
      {view.finalYearAnnounced && (
        <Banner tone="alert" title="Final year">
          Your teacher says this is the final year.
        </Banner>
      )}
      {view.isPractice && (
        <Banner title="Practice">
          This year does not count towards your score. Everything else works the same.
        </Banner>
      )}

      <div className="cols cols-2">
        <div className="stack">
          <DecisionPanel view={view} send={send} onSaid={onSaid} />
          <LastYearPanel view={view} />
          <HistoryPanel view={view} />
        </div>
        <div className="stack">
          <MessagesPanel view={view} send={send} onSaid={onSaid} serverNow={serverNow} />
        </div>
      </div>
    </>
  );
}
