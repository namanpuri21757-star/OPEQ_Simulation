import { NETWORK_CHECK_OK_MS } from '@shared/constants';
import type { InstructorView } from '@shared/views';

/**
 * The things that need the teacher's attention, found for them (SPEC 8.4).
 *
 * This exists because the grid is wide and a teacher is usually facing the room
 * rather than the screen. Nothing here is new information: every alert is
 * something already visible somewhere else, pulled out and said in one line.
 *
 * `alertsFor` is a plain function so it can be tested without a browser, and so
 * the list is built from the view and nothing else.
 */
export interface Alert {
  id: string;
  /** "warning" is something to look at; "alert" is something to act on now. */
  tone: 'info' | 'warning' | 'alert';
  text: string;
}

/** How little time may be left before a missing decision becomes an alert. */
export const LATE_MS = 20_000;

export function alertsFor(view: InstructorView): Alert[] {
  const out: Alert[] = [];

  // A phase that was running when the server stopped comes back paused, and the
  // room is sitting there waiting for a timer that is not counting.
  if (view.timing.resumedAfterRestart) {
    out.push({
      id: 'restart',
      tone: 'alert',
      text: 'Resumed after restart - press Resume. The timer is holding where it was.',
    });
  }

  for (const team of view.teams) {
    if (team.pendingTakeover) {
      out.push({
        id: `takeover-${team.teamId}`,
        tone: 'alert',
        text: `Another computer wants to run ${team.label}. Approve or deny it in the lobby list.`,
      });
    }
  }

  const open = view.phase === 'YEAR_OPEN' || view.phase === 'PRACTICE_OPEN';
  const left = view.timing.remainingMs;
  if (open && left !== null && left <= LATE_MS && !view.timing.paused) {
    const seconds = Math.max(0, Math.round(left / 1000));
    for (const team of view.teams) {
      if (team.decision !== null) continue;
      out.push({
        id: `late-${team.teamId}`,
        tone: 'warning',
        text: `${team.label} has not submitted, ${String(seconds)} s left.`,
      });
    }
  }

  for (const team of view.teams) {
    if (!team.claimed || team.connected) continue;
    out.push({
      id: `offline-${team.teamId}`,
      tone: 'warning',
      text: `Terminal offline: ${team.label}. It will catch up on its own when it comes back.`,
    });
  }

  const checks = Object.values(view.networkChecks);
  if (checks.length > 0) {
    const ok = checks.filter(
      (check) => check.rttMs <= NETWORK_CHECK_OK_MS && check.transport !== 'unknown',
    );
    const slow = checks.length - ok.length;
    out.push({
      id: 'network',
      tone: slow === 0 ? 'info' : 'warning',
      text:
        slow === 0
          ? `Network check: ${String(ok.length)} of ${String(checks.length)} OK.`
          : `Network check: ${String(ok.length)} of ${String(checks.length)} OK. ${String(slow)} computer${slow === 1 ? '' : 's'} answered slowly - they will still play, just a little behind.`,
    });
  }

  return out;
}

export function Alerts({ view }: { view: InstructorView }) {
  const alerts = alertsFor(view);

  return (
    <section className="panel alerts" aria-labelledby="alerts-heading">
      <h2 id="alerts-heading">Things to look at</h2>
      {/* Polite, not assertive: these appear while the teacher is talking, and
          nothing here is urgent enough to interrupt a sentence. */}
      <div role="status" aria-live="polite">
        {alerts.length === 0 ? (
          <p className="hint">Nothing needs you. Everyone is connected and up to date.</p>
        ) : (
          <ul className="alert-list">
            {alerts.map((alert) => (
              <li className={`alert alert-${alert.tone}`} key={alert.id}>
                {alert.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
