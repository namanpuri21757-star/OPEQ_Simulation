import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ackOk, type Ack } from '@shared/protocol';
import { instructorView, suggested } from '../../../tests/support/instructorView';
import { timing } from '../../../tests/support/teamView';
import type { InstructorViewOptions } from '../../../tests/support/instructorView';
import { PhaseBar } from './PhaseBar';

function sender(ack: Ack = ackOk('cmd-1', 13)) {
  return vi.fn(() => Promise.resolve(ack));
}

function renderBar(over: InstructorViewOptions = {}, asking = false) {
  const send = sender();
  const said = vi.fn();
  const onCancel = vi.fn();
  const onAsk = vi.fn();
  const view = instructorView(over);
  render(
    <PhaseBar
      view={view}
      send={send}
      onSaid={said}
      serverNow={() => view.timing.serverNow}
      askingSuggested={asking}
      onAskSuggested={onAsk}
      onCancelSuggested={onCancel}
    />,
  );
  return { send, said, onAsk, onCancel, user: userEvent.setup() };
}

/** The one big button, which may share a label with a secondary control. */
const bigButton = () =>
  within(screen.getByRole('group', { name: 'The next step' })).getByRole('button');

/** What the send stub was called with, as (type, payload, options). */
function callOf(send: ReturnType<typeof sender>, index = 0) {
  return send.mock.calls[index] as unknown as [
    string,
    Record<string, unknown>,
    { expectedPhase?: string; expectedYear?: number } | undefined,
  ];
}

describe('the suggested action', () => {
  /**
   * The label and the command both come from the server, so these cases are the
   * schedule from SPEC section 4 as a teacher meets it, one press at a time.
   */
  it.each([
    ['LOBBY', 0, 'setBriefingSlide', 'Start the briefing'],
    ['BRIEFING', 0, 'startPractice', 'Start the practice year'],
    ['PRACTICE_OPEN', 0, 'closeYear', 'Close the practice year'],
    ['PRACTICE_REVEAL', 0, 'openYear', 'Start Year 1'],
    ['YEAR_OPEN', 5, 'closeYear', 'Close Year 5'],
    ['YEAR_REVEAL', 3, 'startBetween', 'Open chat window (4 min)'],
    ['YEAR_REVEAL', 7, 'startBetween', 'Hold the summit (5 min)'],
    ['YEAR_REVEAL', 11, 'announceFinalYear', 'Announce the final year'],
    ['BETWEEN', 3, 'endBetween', 'End the chat window'],
    ['ENDED', 12, 'revealResultsToTeams', 'Reveal results to teams'],
  ])('reads "%s" at year %i as the one button: %s', (phase, year, command, label) => {
    renderBar({
      phase: phase as 'LOBBY',
      year,
      suggested: suggested({ command, label, expectedPhase: phase as 'LOBBY', expectedYear: year }),
    });

    expect(bigButton()).toHaveAccessibleName(label);
  });

  it('asks before acting, and sends the guards the server gave it', async () => {
    const { send, onAsk, user } = renderBar(
      {
        phase: 'YEAR_REVEAL',
        year: 3,
        suggested: suggested({
          command: 'startBetween',
          label: 'Open chat window (4 min)',
          payload: { kind: 'chat', seconds: 240 },
          expectedPhase: 'YEAR_REVEAL',
          expectedYear: 3,
        }),
      },
      true,
    );

    // The dialog is up because the dashboard said so; nothing has been sent.
    expect(send).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, open chat window (4 min)' }));

    const [type, payload, options] = callOf(send);
    expect(type).toBe('startBetween');
    expect(payload).toEqual({ kind: 'chat', seconds: 240 });
    expect(options).toEqual({ expectedPhase: 'YEAR_REVEAL', expectedYear: 3 });
  });

  it('sends nothing when the teacher backs out', async () => {
    const { send, onCancel, user } = renderBar({}, true);
    await user.click(screen.getByRole('button', { name: 'No, go back' }));

    expect(send).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalled();
  });

  it('has nothing to press once the results are out', () => {
    renderBar({
      phase: 'ENDED',
      year: 12,
      resultsRevealedToTeams: true,
      suggested: suggested({
        command: null,
        label: 'Open the debrief',
        expectedPhase: 'ENDED',
        expectedYear: 12,
      }),
    });

    expect(bigButton()).toBeDisabled();
    expect(bigButton()).toHaveAccessibleName('Open the debrief');
  });
});

describe('the secondary controls', () => {
  it('offers Pause while the clock is running, and nothing else', async () => {
    const { send, user } = renderBar();
    expect(screen.queryByRole('button', { name: 'Resume' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(callOf(send)[0]).toBe('pause');
  });

  it('offers Resume once it is paused, and nothing else', async () => {
    const { send, user } = renderBar({
      timing: timing({ paused: true, deadline: null, remainingMs: 42_000 }),
    });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(callOf(send)[0]).toBe('resume');
  });

  it('adds thirty seconds', async () => {
    const { send, user } = renderBar();
    await user.click(screen.getByRole('button', { name: '+30 s' }));

    const [type, payload] = callOf(send);
    expect(type).toBe('extend');
    expect(payload).toEqual({ seconds: 30 });
  });

  it('confirms before closing a year, and says what happens to missing numbers', async () => {
    const { send, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Close now' }));

    expect(send).not.toHaveBeenCalled();
    expect(
      screen.getByText(/repeats its last number, marked auto. This cannot be undone/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes, close it' }));
    const [type, , options] = callOf(send);
    expect(type).toBe('closeYear');
    expect(options).toEqual({ expectedPhase: 'YEAR_OPEN', expectedYear: 5 });
  });

  it('confirms before ending the game, and warns about the open year', async () => {
    const { send, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'End game' }));

    expect(
      screen.getByText(/This year is still open. It will be dropped and never scored/),
    ).toBeInTheDocument();
    expect(send).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, end the game' }));
    expect(callOf(send)[0]).toBe('endGame');
  });

  it('confirms before firing an event and sends the guards', async () => {
    const { send, user } = renderBar({ phase: 'YEAR_REVEAL', year: 4 });
    await user.click(screen.getByRole('button', { name: 'Bring in the new producer' }));

    expect(screen.getByText(/15 million barrels a year from the next year on/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, do it next year' }));

    const [type, payload, options] = callOf(send);
    expect(type).toBe('fireEvent');
    expect(payload).toEqual({ kind: 'newProducer' });
    expect(options).toEqual({ expectedPhase: 'YEAR_REVEAL', expectedYear: 4 });
  });

  it('only offers the final-year warning when the next year really is the last', () => {
    renderBar({ phase: 'YEAR_REVEAL', year: 4 });
    expect(screen.getByRole('button', { name: 'Announce the final year' })).toBeDisabled();
  });

  it('announces the final year when it is due', async () => {
    const { send, user } = renderBar({ phase: 'YEAR_REVEAL', year: 11 });
    await user.click(screen.getByRole('button', { name: 'Announce the final year' }));
    await user.click(screen.getByRole('button', { name: 'Yes, announce it' }));

    const [type, , options] = callOf(send);
    expect(type).toBe('announceFinalYear');
    expect(options).toEqual({ expectedPhase: 'YEAR_REVEAL', expectedYear: 11 });
  });

  it('sends an announcement to one world', async () => {
    const { send, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Announcement' }));
    await user.type(screen.getByLabelText('What should the room read?'), 'Two minutes left.');
    await user.selectOptions(screen.getByLabelText('Who sees it?'), 'world-2');
    await user.click(screen.getByRole('button', { name: 'Send it' }));

    const [type, payload] = callOf(send);
    expect(type).toBe('announce');
    expect(payload).toEqual({ text: 'Two minutes left.', worldId: 'world-2' });
  });

  it('leaves the world out when the announcement is for everyone', async () => {
    const { send, user } = renderBar();
    await user.click(screen.getByRole('button', { name: 'Announcement' }));
    await user.type(screen.getByLabelText('What should the room read?'), 'Well played.');
    await user.click(screen.getByRole('button', { name: 'Send it' }));

    expect(callOf(send)[1]).toEqual({ text: 'Well played.' });
  });
});

describe('the paused state', () => {
  it('says a restart paused it, and what to do about it', () => {
    renderBar({
      timing: timing({
        paused: true,
        deadline: null,
        remainingMs: 30_000,
        resumedAfterRestart: true,
      }),
    });
    expect(screen.getByText('Resumed after restart - press Resume')).toBeInTheDocument();
  });

  it('says the teacher paused it otherwise', () => {
    renderBar({ timing: timing({ paused: true, deadline: null, remainingMs: 30_000 }) });
    expect(screen.getByText('Paused. Press Resume when the room is ready.')).toBeInTheDocument();
  });
});
