import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Banner, type Say } from '../ui';
import { DecisionPanel } from './DecisionPanel';
import { HistoryPanel } from './HistoryPanel';
import { HuddlePanel } from './HuddlePanel';
import { MessagesPanel } from './MessagesPanel';
import { NewsPanel } from './NewsPanel';
import { PredictionPanel } from './PredictionPanel';
import { RolesLine } from './RolesLine';
import { WhatIfPanel } from './WhatIfPanel';

/**
 * An open year (SPEC 8.3). The decision box comes first and the timer is in the
 * header, so the two things that matter are always on screen.
 *
 * Once the group has submitted, the waiting question appears underneath; the
 * decision box stays, because the last number before the year closes is the one
 * that counts and groups do change their minds.
 */
export interface YearScreenProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
}

export function YearScreen({ view, send, onSaid }: YearScreenProps) {
  const submitted = view.decision !== null;

  return (
    <>
      {view.finalYearAnnounced && (
        <Banner tone="warning" title="Final year">
          Your teacher says this is the final year.
        </Banner>
      )}
      {view.isPractice && (
        <Banner title="Practice">
          This is the practice year. It does not count towards your score.
        </Banner>
      )}

      <RolesLine roles={view.roles} />

      <div className="columns">
        <div className="column-main">
          <DecisionPanel view={view} send={send} onSaid={onSaid} />

          {submitted && (
            <p className="waiting" role="status">
              Waiting for the year to end. You can still change your number until the timer stops.
            </p>
          )}
          <p className="hint">
            {`${String(view.submittedCount)} of 3 countries in your world have submitted.`}
          </p>

          {submitted && <PredictionPanel view={view} send={send} onSaid={onSaid} />}

          <WhatIfPanel view={view} />
        </div>

        <div className="column-side">
          <HuddlePanel view={view} send={send} onSaid={onSaid} />
          <NewsPanel view={view} />
          <MessagesPanel view={view} send={send} onSaid={onSaid} />
          <HistoryPanel view={view} />
        </div>
      </div>
    </>
  );
}
