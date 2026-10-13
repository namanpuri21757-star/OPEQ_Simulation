import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PRESETS, validateSettings, type SettingsInput } from '@shared/settings';
import { RoundsPlanner, clock, roundsOf, withRounds } from './RoundsPlanner';

/** The planner with a real draft behind it, reporting every change. */
function Harness({ start, onDraft }: { start: SettingsInput; onDraft(d: SettingsInput): void }) {
  const [draft, setDraft] = useState(start);
  return (
    <RoundsPlanner
      draft={draft}
      problems={{}}
      onDraft={(next) => {
        setDraft(next);
        onDraft(next);
      }}
    />
  );
}

function setup(start: SettingsInput = { ...PRESETS['standard-75'] }) {
  const onDraft = vi.fn();
  render(<Harness start={start} onDraft={onDraft} />);
  const last = () => onDraft.mock.calls.at(-1)?.[0] as SettingsInput;
  return { user: userEvent.setup(), last };
}

describe('the round plan', () => {
  it('starts from what the preset already does', () => {
    const rounds = roundsOf(PRESETS['standard-75']);
    expect(rounds).toHaveLength(12);
    expect(rounds[0]?.seconds).toBe(150);
    expect(rounds[4]?.seconds).toBe(120);
    // A chat window after Year 3 is messaging in Round 4; the summit after 7 is Round 8.
    expect(rounds[3]?.messaging).toBe(true);
    expect(rounds[7]?.faceToFace).toBe(true);
    expect(rounds[0]?.messaging).toBe(false);
  });

  it('shows the total time for the whole simulation', () => {
    setup();
    // 3 x 150 + 9 x 120 = 1530 s of rounds, plus 120 s of practice.
    expect(screen.getByText('Total simulation time: 27 min 30 s')).toBeInTheDocument();
  });

  it('asks for the number of rounds and keeps every setting valid', async () => {
    const { user, last } = setup();
    const count = screen.getByLabelText('Number of rounds');
    await user.clear(count);
    await user.type(count, '5');

    const draft = last();
    expect(draft.years).toBe(5);
    expect(draft.rounds).toHaveLength(5);
    expect(draft.schedule).toEqual([]);
    // The preset's new producer in Year 9 would no longer be played, so it moves in.
    expect(validateSettings(draft).ok).toBe(true);
    expect(screen.getAllByRole('row')).toHaveLength(6);
  });

  it('sets one time for every round and updates the total', async () => {
    const { user, last } = setup();
    await user.type(screen.getByLabelText('Time for every round'), '60');
    await user.click(screen.getByRole('button', { name: 'Apply to all rounds' }));

    expect(last().rounds?.every((round) => round.seconds === 60)).toBe(true);
    expect(screen.getByText('Total simulation time: 14 min')).toBeInTheDocument();
  });

  it('turns each option on or off for one round only', async () => {
    const { user, last } = setup();
    await user.click(screen.getByLabelText('Round 2: Messaging'));
    await user.click(screen.getByLabelText('Round 3: Face to face'));
    await user.click(screen.getByLabelText('Round 1: See all world totals'));

    const rounds = last().rounds ?? [];
    expect(rounds[1]?.messaging).toBe(true);
    expect(rounds[2]?.faceToFace).toBe(true);
    expect(rounds[0]?.seeAllTotals).toBe(false);
    expect(rounds[0]?.messaging).toBe(false);
    expect(rounds[1]?.seeAllTotals).toBe(true);
  });

  it('changes the time of one round', async () => {
    const { user, last } = setup();
    const box = screen.getByLabelText('Round 2 time in seconds');
    await user.clear(box);
    await user.type(box, '200');
    expect(last().rounds?.[1]?.seconds).toBe(200);
  });

  it('says so when a round time is out of range', async () => {
    const { user } = setup();
    const box = screen.getByLabelText('Round 1 time in seconds');
    await user.clear(box);
    await user.type(box, '3');
    expect(screen.getByText('Round 1: use 5 to 3600 seconds.')).toBeInTheDocument();
  });

  it('turns moving on by itself on and off in one box', async () => {
    const { user, last } = setup();
    await user.click(screen.getByLabelText('Move on by itself'));
    expect(last()).toMatchObject({ autoClose: true, autoAdvance: true });
    await user.click(screen.getByLabelText('Move on by itself'));
    expect(last()).toMatchObject({ autoClose: false, autoAdvance: false });
  });

  it('writes times as minutes and seconds', () => {
    expect(clock(45)).toBe('45 s');
    expect(clock(120)).toBe('2 min');
    expect(clock(1650)).toBe('27 min 30 s');
  });

  it('keeps a plan the server accepts for any number of rounds', () => {
    for (const years of [1, 2, 8, 20, 40]) {
      const rounds = Array.from({ length: years }, () => ({
        seconds: 60,
        messaging: false,
        faceToFace: false,
        seeAllTotals: true,
      }));
      expect(validateSettings(withRounds(PRESETS['standard-75'], rounds)).ok, String(years)).toBe(
        true,
      );
    }
  });
});
