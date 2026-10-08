import { useEffect, useMemo, useRef, useState } from 'react';
import { APP_NAME, NETWORK_CHECK_OK_MS, NETWORK_CHECK_PINGS } from '@shared/constants';
import {
  RoleConnection,
  browserStore,
  fetchOpenSessions,
  makeCommandId,
  newestSession,
  readTerminal,
  useView,
} from '../net';
import { Banner, Button, DataTable } from '../ui';

/**
 * The network check (SPEC 8.6): will this computer keep up in class?
 *
 * Any computer in the room can open it, before anyone has a join code, which is
 * the point: a teacher walks round with it and finds the one laptop on the wrong
 * Wi-Fi in a minute rather than in Year 3.
 *
 * It measures a round trip twenty times with the `ping` command, which changes
 * nothing and is never saved, then sends one `report` that lands on the
 * dashboard as "Network check: 9 of 9 OK".
 *
 * When this browser has already claimed a country, the check reports as that
 * country, so the teacher's lobby list can show a result against each row
 * rather than a single total. A computer with no country still reports; it is
 * just counted as "another computer".
 */
type Phase = 'idle' | 'running' | 'done';

interface Result {
  median: number;
  worst: number;
  transport: 'websocket' | 'polling' | 'unknown';
  ok: boolean;
}

export default function CheckPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = useMemo(() => readTerminal(browserStore()), []);

  // The check page has no code and no key, so like a terminal it has to ask
  // which session is open on this computer before it can say hello. If this
  // computer already belongs to a country, that country's session is the one to
  // join, so the token it holds is the right token.
  useEffect(() => {
    let alive = true;
    fetchOpenSessions()
      .then((sessions) => {
        if (!alive) return;
        const mine = sessions.find((open) => open.sessionId === saved?.sessionId);
        const chosen = mine ?? newestSession(sessions);
        if (chosen) setSessionId(chosen.sessionId);
        else setProblem('No game is open on this computer yet. Ask your teacher to start one.');
      })
      .catch(() => {
        if (alive) setProblem('This computer cannot reach the game. Check the Wi-Fi first.');
      });
    return () => {
      alive = false;
    };
  }, [saved]);

  if (sessionId === null) {
    return (
      <main className="sheet page-check">
        <h1>{APP_NAME}</h1>
        <h2>Network check</h2>
        <p role="status">{problem ?? 'Looking for the game...'}</p>
      </main>
    );
  }

  const label = saved && saved.sessionId === sessionId ? saved.label : null;

  return (
    <RoleConnection sessionId={sessionId} role="check">
      <Check label={label} />
    </RoleConnection>
  );
}

function Check({ label }: { label: string | null }) {
  const { send, status, connection } = useView<unknown>();
  const [phase, setPhase] = useState<Phase>('idle');
  const [times, setTimes] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  // One id per computer, so a second check from the same laptop replaces the
  // first on the dashboard rather than counting twice.
  const clientId = useRef(makeCommandId('check'));

  const run = async () => {
    setPhase('running');
    setTimes([]);
    const measured: number[] = [];

    for (let i = 0; i < NETWORK_CHECK_PINGS; i += 1) {
      const started = Date.now();
      const ack = await send('ping', {});
      if (!ack.ok) break;
      measured.push(Date.now() - started);
      setTimes([...measured]);
    }

    if (measured.length === 0) {
      setPhase('idle');
      return;
    }

    const sorted = [...measured].sort((x, y) => x - y);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    const worst = sorted[sorted.length - 1] ?? 0;
    const transport = connection.transport();
    const ok = median <= NETWORK_CHECK_OK_MS && transport !== 'unknown';

    setResult({ median, worst, transport, ok });
    setPhase('done');
    await send('report', { clientId: clientId.current, rttMs: median, transport });
  };

  return (
    <main className="sheet page-check">
      <h1>{APP_NAME}</h1>
      <h2>Network check</h2>
      <p>
        This measures how long this computer takes to reach the teacher&rsquo;s computer and back.
        It changes nothing in the game.
      </p>
      <p className="note">
        {label === null
          ? 'This computer has not joined a country yet, so your teacher will see the result as "another computer". Join your country first if you want it next to your name on their screen.'
          : `Your teacher will see this result next to ${label}.`}
      </p>

      {status !== 'online' && (
        <Banner tone="warning" title="Connecting">
          Waiting for this computer to reach the game.
        </Banner>
      )}

      <Button
        tone="primary"
        size="large"
        onClick={() => void run()}
        disabled={status !== 'online' || phase === 'running'}
      >
        {phase === 'done' ? 'Check again' : 'Start the check'}
      </Button>

      {phase === 'running' && (
        <p role="status">
          {`Measuring... ${String(times.length)} of ${String(NETWORK_CHECK_PINGS)}.`}
        </p>
      )}

      {phase === 'done' && result !== null && (
        <section className="box check-result" aria-labelledby="result-heading">
          <h3 id="result-heading">{result.ok ? 'OK' : 'This computer is slow'}</h3>
          <p role="status">
            {result.ok
              ? `This computer answers in about ${String(result.median)} ms, which is comfortable. Nothing to do.`
              : `This computer takes about ${String(result.median)} ms to answer, which is slower than the ${String(NETWORK_CHECK_OK_MS)} ms the game is built for. It will still play, but the timer may look a second behind. Moving closer to the Wi-Fi point usually fixes it.`}
          </p>
          <DataTable
            caption="What was measured"
            columns={['Measure', 'Value']}
            rows={[
              ['Usual round trip', `${String(result.median)} ms`],
              ['Slowest round trip', `${String(result.worst)} ms`],
              ['Connection type', result.transport],
              ['Measurements', String(times.length)],
            ]}
          />
          <p className="note">Your teacher&rsquo;s dashboard has been told the result.</p>
        </section>
      )}
    </main>
  );
}
