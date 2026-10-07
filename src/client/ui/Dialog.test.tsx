import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Dialog } from './Dialog';

function Example({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      title="Submit 38.3 million barrels for Year 5?"
      onClose={onClose}
      footer={
        <>
          <Button tone="primary">Yes, submit</Button>
          <Button onClick={onClose}>No, go back</Button>
        </>
      }
    >
      <p>You can change it again until the timer ends.</p>
    </Dialog>
  );
}

describe('Dialog', () => {
  it('is a labelled modal dialog', () => {
    render(<Example onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', {
      name: 'Submit 38.3 million barrels for Year 5?',
    });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('moves focus to the first button when it opens', () => {
    render(<Example onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Yes, submit' })).toHaveFocus();
  });

  it('keeps Tab inside itself', async () => {
    const user = userEvent.setup();
    render(<Example onClose={vi.fn()} />);
    const yes = screen.getByRole('button', { name: 'Yes, submit' });
    const no = screen.getByRole('button', { name: 'No, go back' });

    await user.tab();
    expect(no).toHaveFocus();
    // Past the last button, focus comes back round rather than leaving for the
    // browser's own toolbar.
    await user.tab();
    expect(yes).toHaveFocus();
    await user.tab({ shift: true });
    expect(no).toHaveFocus();
  });

  it('closes with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Example onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gives focus back to whatever opened it', async () => {
    const user = userEvent.setup();
    function Host() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Submit</Button>
          {open && <Example onClose={() => setOpen(false)} />}
        </>
      );
    }
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Submit' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });
});
