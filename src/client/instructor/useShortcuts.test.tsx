import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useShortcuts, type Shortcuts } from './useShortcuts';

function Harness(props: Shortcuts) {
  useShortcuts(props);
  return (
    <div>
      <input aria-label="Announcement" />
      <div role="dialog" aria-label="A question">
        <button type="button">Yes</button>
      </div>
    </div>
  );
}

function setup(enabled = true) {
  const onNext = vi.fn();
  const onPauseOrResume = vi.fn();
  render(<Harness onNext={onNext} onPauseOrResume={onPauseOrResume} enabled={enabled} />);
  return { onNext, onPauseOrResume, user: userEvent.setup() };
}

describe('the dashboard shortcuts', () => {
  it('uses N for the next step and Space for pause', async () => {
    const { onNext, onPauseOrResume, user } = setup();

    await user.keyboard('n');
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.keyboard('[Space]');
    expect(onPauseOrResume).toHaveBeenCalledTimes(1);
  });

  it('takes a capital N too, for a teacher with caps lock on', async () => {
    const { onNext, user } = setup();
    await user.keyboard('N');
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('stays out of the way while the teacher is typing', async () => {
    const { onNext, onPauseOrResume, user } = setup();

    await user.click(screen.getByLabelText('Announcement'));
    await user.keyboard('no new producer this year');

    expect(onNext).not.toHaveBeenCalled();
    expect(onPauseOrResume).not.toHaveBeenCalled();
  });

  it('stays out of the way while a dialog has the keyboard', async () => {
    const { onNext, onPauseOrResume, user } = setup();

    screen.getByRole('button', { name: 'Yes' }).focus();
    await user.keyboard('n[Space]');

    expect(onNext).not.toHaveBeenCalled();
    expect(onPauseOrResume).not.toHaveBeenCalled();
  });

  it('ignores a key held with Ctrl, Alt or the command key', async () => {
    const { onNext, user } = setup();
    await user.keyboard('{Control>}n{/Control}');
    expect(onNext).not.toHaveBeenCalled();
  });

  it('does nothing at all when it is turned off', async () => {
    const { onNext, onPauseOrResume, user } = setup(false);
    await user.keyboard('n[Space]');

    expect(onNext).not.toHaveBeenCalled();
    expect(onPauseOrResume).not.toHaveBeenCalled();
  });
});
