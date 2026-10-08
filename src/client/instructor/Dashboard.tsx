import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InstructorTeamView, InstructorView, SuggestedAction } from '@shared/views';
import type { ConnectionStatus, SendCommand } from '../net';
import { statusMessage } from '../net';
import { Banner, Button, Toast, useToast } from '../ui';
import { Alerts } from './Alerts';
import { BriefingControl } from './BriefingControl';
import { ChatFeeds } from './ChatFeeds';
import { DangerZone } from './DangerZone';
import { DebriefPanel } from './DebriefPanel';
import { ExportsPanel } from './ExportsPanel';
import { LobbyPanel } from './LobbyPanel';
import { OverrideDialog } from './OverrideDialog';
import { PhaseBar } from './PhaseBar';
import { SetupScreen } from './SetupScreen';
import { TeamGrid } from './TeamGrid';
import { projectorLink } from './links';
import { useShortcuts } from './useShortcuts';

/**
 * The instructor dashboard (SPEC 8.4).
 *
 * The order down the page is the order a teacher needs things: where we are and
 * the one next step, then anything that needs attention, then the detail. In the
 * lobby the detail is the setup form and the join links; once the game starts it
 * is the grid and the chat feeds.
 *
 * The instructor key is in this screen's own link and nowhere else on it, so
 * nothing on the page can end up on the projector by accident (SPEC 8.4).
 */
export interface DashboardProps {
  view: InstructorView;
  send: SendCommand;
  status: ConnectionStatus;
  serverNow(): number;
  /** Called after the session is deleted, so the screen forgets it. */
  onDeleted(): void;
}

export function Dashboard({ view, send, status, serverNow, onDeleted }: DashboardProps) {
  const { message, say } = useToast();
  const [overriding, setOverriding] = useState<InstructorTeamView | null>(null);
  // N and the big button open the same confirmation, so this one piece of state
  // lives here rather than inside the phase bar. It holds the suggestion as it
  // was when the dialog opened, so the step the teacher read is the step that
  // runs even if a timer moves the lesson on while they are reading it.
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
  const inLobby = view.phase === 'LOBBY';
  const atPracticeReveal = view.phase === 'PRACTICE_REVEAL';

  return (
    <main className="page page-instructor">
      <header className="instructor-header">
        <div>
          <h1>Crude Accord</h1>
          <p className="hint">
            {`Session ${view.sessionId} - ${String(view.worlds.length)} worlds, ${String(view.teams.length)} countries`}
          </p>
        </div>
        <div className="instructor-header-actions">
          <Button
            onClick={() => {
              // A second window, so the projector screen can live on the other
              // display while the dashboard stays here.
              window.open(projectorLink(view), 'crude-accord-projector', 'noopener');
            }}
          >
            Projector link
          </Button>
          <Link className="button" to="/instructor/cards" target="_blank" rel="noreferrer">
            Team cards
          </Link>
          <Link className="button" to="/instructor/materials" target="_blank" rel="noreferrer">
            Materials
          </Link>
        </div>
      </header>

      {offline !== null && (
        <Banner tone="warning" title="Offline">
          {offline}
        </Banner>
      )}

      {view.resultsRevealedToTeams && (
        <Banner tone="info" title="Results">
          Teams can now see the other worlds and the leaderboard.
        </Banner>
      )}

      {atPracticeReveal && (
        <Banner tone="info" title="Practice over">
          The practice year does not count and is left out of every score. Pressing the big button
          starts the real game at Year 1.
        </Banner>
      )}

      <PhaseBar
        view={view}
        send={send}
        onSaid={say}
        serverNow={serverNow}
        asking={asking}
        onAskSuggested={() => setAsking(suggested)}
        onCancelSuggested={() => setAsking(null)}
      />

      <p className="shortcuts" role="note">
        Keys: <kbd>N</kbd> for the next step (it asks first), <kbd>Space</kbd> to pause or resume.
        They are off while you are typing.
      </p>

      <Alerts view={view} />

      {inLobby ? (
        <>
          <SetupScreen view={view} send={send} onSaid={say} />
          <LobbyPanel view={view} send={send} onSaid={say} />
        </>
      ) : (
        <>
          {view.phase === 'BRIEFING' && <BriefingControl view={view} send={send} onSaid={say} />}
          <TeamGrid view={view} onOverride={setOverriding} onMute={(team) => void onMute(team)} />
          <ChatFeeds view={view} send={send} onSaid={say} />
          <LobbyPanel view={view} send={send} onSaid={say} />
          {view.phase === 'ENDED' && <DebriefPanel view={view} send={send} onSaid={say} />}
          {/* Downloads are their own section (SPEC 8.4), not part of the
              debrief: a lesson that ran out of time can still be taken away. */}
          <ExportsPanel view={view} />
        </>
      )}

      <DangerZone view={view} send={send} onSaid={say} onDeleted={onDeleted} />

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
