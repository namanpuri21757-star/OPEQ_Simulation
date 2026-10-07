import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ackFail, ackOk, type Ack, type ClaimTeamResult } from '@shared/protocol';
import {
  Connection,
  clearTerminal,
  memoryStore,
  readTerminal,
  type ConnectionBundle,
} from '../net';
import { ConnectionValueProvider } from '../net/ConnectionProvider';
import Join from './Join';

const CLAIM: ClaimTeamResult = {
  teamId: 'world-2-B',
  worldId: 'world-2',
  worldNumber: 2,
  letter: 'B',
  label: 'World 2 - Borvia (B)',
  token: 'a-token-long-enough-to-store',
  tookOver: false,
};

/** The connection's own store, so a test can read what was remembered. */
const store = memoryStore();

function bundle(over: Partial<ConnectionBundle>, send: ConnectionBundle['send']): ConnectionBundle {
  return {
    status: 'online',
    view: { kind: 'lobby' },
    version: 1,
    needsClaim: true,
    teamId: null,
    gone: null,
    problem: null,
    claimed: null,
    pending: 0,
    send,
    serverNow: () => 1_700_000_000_000,
    connection: new Connection({ sessionId: 'session-demo', role: 'team', store }),
    ...over,
  };
}

function tree(value: ConnectionBundle, path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <ConnectionValueProvider value={value}>
        <Routes>
          <Route path="/join" element={<Join />} />
          <Route path="/join/:code" element={<Join />} />
          <Route path="/team" element={<p>the team screen</p>} />
        </Routes>
      </ConnectionValueProvider>
    </MemoryRouter>
  );
}

function show(
  acks: Ack[] = [ackOk('cmd-1', 2, CLAIM)],
  over: Partial<ConnectionBundle> = {},
  path = '/join',
) {
  const send = vi.fn(() => Promise.resolve(acks.shift() ?? ackOk('cmd-x', 9)));
  const value = bundle(over, send as unknown as ConnectionBundle['send']);
  const view = render(tree(value, path));
  return {
    send,
    value,
    /** What a push from the server looks like: the same screen, new state. */
    arrives(change: Partial<ConnectionBundle>) {
      view.rerender(tree({ ...value, ...change }, path));
    },
  };
}

afterEach(() => {
  clearTerminal(window.localStorage);
  clearTerminal(store);
});

describe('Join', () => {
  it('tidies up what is typed into the code box', async () => {
    const user = userEvent.setup();
    show();
    const box = screen.getByLabelText('Team code');

    await user.type(box, 'bc d2 3f');
    expect(box).toHaveValue('BCD23F');
  });

  it('waits for a whole code before it will try', async () => {
    const user = userEvent.setup();
    const { send } = show();
    const go = screen.getByRole('button', { name: 'This is our code' });

    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText('Team code'), 'BCD23');
    expect(go).toBeDisabled();
    await user.type(screen.getByLabelText('Team code'), 'F');
    expect(go).toBeEnabled();
    expect(send).not.toHaveBeenCalled();
  });

  it('fills the box in from a scanned link', () => {
    show(undefined, {}, '/join/bcd23f');
    expect(screen.getByLabelText('Team code')).toHaveValue('BCD23F');
  });

  it('checks the country with the group before going on', async () => {
    const user = userEvent.setup();
    const { send } = show();

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));

    expect(send).toHaveBeenCalledWith('claimTeam', { joinCode: 'BCD23F' });
    expect(
      screen.getByRole('heading', { name: 'You are World 2 - Borvia (B). Is that right?' }),
    ).toBeInTheDocument();
  });

  it('asks for the names, then starts, saving only what was typed', async () => {
    const user = userEvent.setup();
    const { send } = show([ackOk('cmd-1', 2, CLAIM), ackOk('cmd-2', 3)]);

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));
    await user.click(screen.getByRole('button', { name: 'Yes, that is us' }));

    await user.type(screen.getByLabelText('First name 1'), 'Maya');
    await user.type(screen.getByLabelText('First name 2'), 'Leo');
    await user.click(screen.getByRole('button', { name: 'Save and start' }));

    expect(send).toHaveBeenLastCalledWith('setMembers', { names: ['Maya', 'Leo'] });
    expect(screen.getByText('the team screen')).toBeInTheDocument();
  });

  it('lets a group skip the names', async () => {
    const user = userEvent.setup();
    const { send } = show();

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));
    await user.click(screen.getByRole('button', { name: 'Yes, that is us' }));
    await user.click(screen.getByRole('button', { name: 'Skip' }));

    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByText('the team screen')).toBeInTheDocument();
  });

  it('keeps the token, so a reload comes back as the same country', async () => {
    const user = userEvent.setup();
    show();
    expect(readTerminal(store)).toBeNull();

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));

    expect(readTerminal(store)).toEqual({
      sessionId: 'session-demo',
      teamId: 'world-2-B',
      token: 'a-token-long-enough-to-store',
      label: 'World 2 - Borvia (B)',
    });
  });

  it('asks the teacher when another computer is already that country', async () => {
    const user = userEvent.setup();
    show([ackFail('cmd-1', 'NEEDS_APPROVAL', 'Your teacher has been asked.')]);

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));

    expect(
      screen.getByRole('heading', { name: 'Ask your teacher to approve this computer' }),
    ).toBeInTheDocument();
  });

  it('passes on a code the server does not know', async () => {
    const user = userEvent.setup();
    show([ackFail('cmd-1', 'NOT_FOUND', 'No team has that code. Check the card.')]);

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));

    expect(screen.getByText('No team has that code. Check the card.')).toBeInTheDocument();
    expect(screen.getByLabelText('Team code')).toBeInTheDocument();
  });

  it('goes back to the code box when the group says it is not them', async () => {
    const user = userEvent.setup();
    show();

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));
    await user.click(screen.getByRole('button', { name: 'No, that is not us' }));

    expect(screen.getByLabelText('Team code')).toHaveValue('');
    expect(screen.getByText(/tell your teacher which code you tried/)).toBeInTheDocument();
  });

  it('shows a takeover the teacher approved, which arrives on its own', async () => {
    const user = userEvent.setup();
    const { arrives } = show([ackFail('cmd-1', 'NEEDS_APPROVAL', 'Your teacher has been asked.')]);

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));
    expect(screen.getByRole('heading', { name: /Ask your teacher/ })).toBeInTheDocument();

    // The server pushes "claimed" rather than answering the command, so the
    // waiting screen has to move on from the connection's state, not from an ack.
    arrives({ claimed: CLAIM, needsClaim: false, teamId: CLAIM.teamId });
    expect(
      screen.getByRole('heading', { name: 'You are World 2 - Borvia (B). Is that right?' }),
    ).toBeInTheDocument();
  });

  it('goes back to the code box when the teacher turns a takeover down', async () => {
    const user = userEvent.setup();
    const { arrives } = show([ackFail('cmd-1', 'NEEDS_APPROVAL', 'Your teacher has been asked.')]);

    await user.type(screen.getByLabelText('Team code'), 'BCD23F');
    await user.click(screen.getByRole('button', { name: 'This is our code' }));
    arrives({
      gone: { reason: 'denied', message: 'Your teacher kept this team on the other computer.' },
    });

    expect(
      screen.getByText('Your teacher kept this team on the other computer.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Team code')).toBeInTheDocument();
  });

  it('sends a claimed computer straight to its screen', () => {
    show([], { needsClaim: false, teamId: 'world-2-B' });
    expect(screen.getByText('the team screen')).toBeInTheDocument();
  });

  it('remembers nothing in the browser until a code is accepted', () => {
    show();
    expect(readTerminal(window.localStorage)).toBeNull();
  });
});
