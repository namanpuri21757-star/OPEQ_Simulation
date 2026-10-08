import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRIEFING_SLIDES } from '@shared/state';
import type { InstructorTeamView, InstructorView, SuggestedAction } from '@shared/views';
import type { ConnectionStatus, SendCommand } from '../net';
import { statusMessage } from '../net';
import { Banner, Button, Toast, useToast } from '../ui';
import { CountriesGrid, problemLine } from './CountriesGrid';
import { DangerZone } from './DangerZone';
import { DebriefPanel } from './DebriefPanel';
import { ExportsPanel } from './ExportsPanel';
import { MessagingPanel } from './MessagingPanel';
import { NextStep } from './NextStep';
import { OverrideDialog } from './OverrideDialog';
import { ResultsTables } from './ResultsTables';
import { StatusStrip } from './StatusStrip';
import { instructorLink } from './links';
import { useShortcuts } from './useShortcuts';

/**
 * The teacher's screen during the lesson (SPEC 8.4), read top to bottom.
 *
 * Where we are, what to do next, whether the students can talk, how each country
 * is doing, what the numbers are. Each band answers one question, and a band
 * that would answer nothing right now is not drawn: there is no results table
 * before the first year closes, and no briefing control once the briefing is
 * over.
 */
export interface LiveScreenProps {
  view: InstructorView;
  send: SendCommand;
  status: ConnectionStatus;
  serverNow(): number;
  /** Called after the session is deleted, so the screen forgets it. */
  onDeleted(): void;
}

export function LiveScreen({ view, send, status, serverNow, onDeleted }: LiveScreenProps) {
  const { message, say } = useToast();
  const [overriding, setOverriding] = useState<InstructorTeamView | null>(null);
  // N and the big button open the same confirmation, so this one piece of state
  // lives here rather than inside NextStep. It holds the suggestion as it was
  // when the dialog opened, so the step the teacher read is the step that runs
  // even if a timer moves the lesson on while they are reading it.
  const [asking, setAsking] = useState<SuggestedAction | null>(null);

  const suggested = view.suggested;
  const onNext = useCallback(() => {
    if (suggested.command !== null) setAsking(suggested);
  }, [suggested]);
  const onPauseOrResume = useCallback(() => {
    if (view.timing.deadline === null && view.timing.remainingMs === null) return;
    void send(view.timing.paused ? 'resume' : 'pause', {}).then((ack) => {
      say(
        ack.ok ? (view.timing.paused ? 'Running again.' : 'Paused.') : ack.message,
        ack.ok ? 'good' : 'bad',
      );
    });
  }, [send, say, view.timing.paused, view.timing.deadline, view.timing.remainingMs]);

  useShortcuts({ onNext, onPauseOrResume });

  const onMute = async (team: InstructorTeamView) => {
    const ack = await send(team.muted ? 'unmuteTeam' : 'muteTeam', { teamId: team.teamId });
    say(
      ack.ok ? `${team.label} is ${team.muted ? 'able to write again' : 'muted'}.` : ack.message,
      ack.ok ? 'good' : 'bad',
    );
  };

  const offline = statusMessage(status);
  const problem = problemLine(view);
  // Only worth drawing once there is a screen to go back to: which screen is
  // up is already in the status strip.
  const briefing = view.phase === 'BRIEFING' && view.briefingSlide > 0;
  const ended = view.phase === 'ENDED';

  return (
    <main className="sheet">
      <header className="teacher-band">
        <h1>Crude Accord</h1>
        <p className="teacher-facts">
          {`${String(view.worlds.length)} worlds · ${String(view.teams.length)} countries · Session ${view.sessionId}`}
        </p>
      </header>

      <div className="stack">
        <StatusStrip view={view} serverNow={serverNow} />

        {offline !== null && (
          <Banner tone="alert" title="Offline">
            {offline}
          </Banner>
        )}
        {problem !== null && (
          <Banner tone="alert" title="Look at">
            {problem}
          </Banner>
        )}

        <NextStep
          view={view}
          send={send}
          onSaid={say}
          asking={asking}
          onAskSuggested={() => setAsking(suggested)}
          onCancelSuggested={() => setAsking(null)}
        />

        {briefing && (
          <section className="box" aria-labelledby="briefing-back">
            <div className="box-head">
              <h2 id="briefing-back">Briefing</h2>
              <span className="label label-muted">
                {`Screen ${String(view.briefingSlide + 1)} of ${String(BRIEFING_SLIDES)}`}
              </span>
            </div>
            <p className="note">Every terminal and the projector are showing this screen.</p>
            <p className="btn-row" style={{ marginTop: 'var(--s4)' }}>
              <Button
                onClick={() =>
                  void send('setBriefingSlide', { slide: view.briefingSlide - 1 }).then((ack) => {
                    if (!ack.ok) say(ack.message, 'bad');
                  })
                }
              >
                Back a screen
              </Button>
            </p>
          </section>
        )}

        {!ended && (
          <>
            <MessagingPanel view={view} send={send} onSaid={say} serverNow={serverNow} />
            <CountriesGrid
              view={view}
              onOverride={setOverriding}
              onMute={(team) => void onMute(team)}
            />
            <ResultsTables view={view} />
          </>
        )}

        {ended && (
          <>
            <DebriefPanel view={view} send={send} onSaid={say} />
            {/* Downloads are their own section (SPEC 8.4), not part of the
                debrief: a lesson that ran out of time can still be taken away. */}
            <ExportsPanel view={view} />
          </>
        )}
      </div>

      <p className="teacher-footer">
        Keys: <kbd>N</kbd> for the next step (it asks first), <kbd>Space</kbd> to pause or resume.
        They are off while you are typing.
      </p>

      <p className="teacher-corner">
        <Link to="/instructor/materials" target="_blank" rel="noreferrer">
          Materials
        </Link>
      </p>

      <DangerZone view={view} send={send} onSaid={say} onDeleted={onDeleted} />

      {/* Kept to the bottom and out of the way: the only reason to read this
          link is to reopen the dashboard later or move it to another laptop,
          and it must never be shown to the room. */}
      <details className="own-link">
        <summary>This dashboard&rsquo;s own link (keep it to yourself)</summary>
        <p className="note">
          It has your instructor key in it. Anyone who opens it can run the game. The projector link
          is a different link and cannot change anything.
        </p>
        <p className="own-link-url">{instructorLink(view)}</p>
      </details>

      {overriding !== null && (
        <OverrideDialog
          view={view}
          team={overriding}
          send={send}
          onSaid={say}
          onClose={() => setOverriding(null)}
        />
      )}

      <Toast message={message} />
    </main>
  );
}
