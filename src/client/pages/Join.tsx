import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { APP_NAME, JOIN_CODE_LENGTH } from '@shared/constants';
import { MAX_MEMBERS, MAX_MEMBER_NAME_CHARS, type ClaimTeamResult } from '@shared/protocol';
import { browserStore, readTerminal, statusMessage, useView } from '../net';
import { Badge, Banner, Button } from '../ui';

/**
 * Joining a team (SPEC 8.2).
 *
 * Four steps, one question each: type the code, check it is really your country,
 * wait if the teacher has to approve this computer, then type your first names if
 * you want to. The code box forgives spaces and lower case, because the code is
 * read off a printed card by someone in a hurry.
 */
type Step = 'code' | 'confirm' | 'waiting' | 'members';

function tidy(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().slice(0, JOIN_CODE_LENGTH);
}

export default function Join() {
  const params = useParams<{ code?: string }>();
  const navigate = useNavigate();
  const { send, status, gone, claimed, teamId, needsClaim, connection } = useView<unknown>();

  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState(() => tidy(params.code ?? ''));
  const [ackClaim, setAckClaim] = useState<ClaimTeamResult | null>(null);
  const [names, setNames] = useState<string[]>(['', '', '', '']);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // What this computer was last time, so a link that names a different country
  // can say which one it would be replacing.
  const saved = useMemo(() => readTerminal(browserStore()), []);
  const [swapping, setSwapping] = useState(false);

  // Two things arrive on their own rather than as an ack: an approved takeover
  // ("claimed") and a refused one ("gone"). Both are worked out while rendering
  // rather than copied into state by an effect, so there is one source of truth
  // for which screen is showing.
  const claim = ackClaim ?? claimed;
  const shownStep: Step =
    step !== 'waiting' ? step : claim !== null ? 'confirm' : gone !== null ? 'code' : 'waiting';
  const shownProblem = problem ?? (shownStep === 'code' && gone !== null ? gone.message : null);

  // This computer already has a country.
  if (shownStep === 'code' && !needsClaim && teamId !== null && claim === null && !swapping) {
    // A bare /join is a student who went back a step: send them to their screen.
    // A /join/CODE link is someone being pointed at a particular country, so it
    // has to be possible to say yes to it - a teacher moving a computer to a
    // different table, or one computer standing in for three in a trial run.
    if (params.code === undefined) return <Navigate to="/team" replace />;

    return (
      <main className="page page-join">
        <h1>{APP_NAME}</h1>
        <section className="panel" aria-labelledby="already-heading">
          <h2 id="already-heading">
            {saved === null
              ? 'This computer is already in the game'
              : `This computer is already ${saved.label}`}
          </h2>
          <p>{`The link you opened is for the code ${code}. What would you like to do?`}</p>
          <div className="row">
            <Button
              tone="primary"
              size="large"
              onClick={() => {
                void navigate('/team');
              }}
            >
              Go back to our screen
            </Button>
            <Button
              onClick={() => {
                // Forget this computer's country first, so the claim below is a
                // fresh one rather than this terminal asking to take itself over.
                connection.forget();
                setSwapping(true);
              }}
            >
              {`Use this computer for ${code} instead`}
            </Button>
          </div>
        </section>
      </main>
    );
  }

  const claimTeam = async () => {
    setBusy(true);
    setProblem(null);
    const ack = await send('claimTeam', { joinCode: code });
    setBusy(false);
    if (ack.ok) {
      const result = ack.result as ClaimTeamResult;
      connection.remember(result);
      setAckClaim(result);
      setStep('confirm');
      return;
    }
    if (ack.code === 'NEEDS_APPROVAL') {
      setStep('waiting');
      return;
    }
    setProblem(ack.message);
  };

  const saveNames = async () => {
    const wanted = names.map((name) => name.trim()).filter((name) => name !== '');
    if (wanted.length === 0) {
      void navigate('/team');
      return;
    }
    setBusy(true);
    const ack = await send('setMembers', { names: wanted });
    setBusy(false);
    if (ack.ok) void navigate('/team');
    else setProblem(ack.message);
  };

  const offline = statusMessage(status);

  return (
    <main className="page page-join">
      <h1>{APP_NAME}</h1>
      {offline !== null && (
        <Banner tone="warning" title="Offline">
          {offline}
        </Banner>
      )}

      {shownStep === 'code' && (
        <section className="panel" aria-labelledby="join-heading">
          <h2 id="join-heading">Type your team code</h2>
          <p className="hint">
            {`It is ${String(JOIN_CODE_LENGTH)} characters, on the card your teacher gave you. Lower case and spaces are fine.`}
          </p>
          <p className="field">
            <label htmlFor="join-code">Team code</label>
            <input
              id="join-code"
              className="join-code-input"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(event) => {
                setCode(tidy(event.target.value));
                setProblem(null);
                // The student has moved on from the refusal they just read.
                if (gone !== null) connection.dismissGone();
              }}
            />
          </p>
          {shownProblem !== null && (
            <p className="problem" role="alert">
              {shownProblem}
            </p>
          )}
          <Button
            tone="primary"
            size="large"
            onClick={() => void claimTeam()}
            disabled={busy || code.length !== JOIN_CODE_LENGTH}
          >
            This is our code
          </Button>
        </section>
      )}

      {shownStep === 'waiting' && (
        <section className="panel" aria-labelledby="waiting-heading">
          <h2 id="waiting-heading">Ask your teacher to approve this computer</h2>
          <p role="status">
            Another computer is already running this country. Your teacher can move it to this one.
          </p>
          <Button
            onClick={() => {
              setStep('code');
              setProblem(null);
            }}
          >
            Use a different code
          </Button>
        </section>
      )}

      {shownStep === 'confirm' && claim !== null && (
        <section className="panel" aria-labelledby="confirm-heading">
          <h2 id="confirm-heading">{`You are ${claim.label}. Is that right?`}</h2>
          <p className="confirm-badge">
            <Badge letter={claim.letter} size="large" withName />
          </p>
          <div className="row">
            <Button
              tone="primary"
              size="large"
              onClick={() => {
                setStep('members');
              }}
            >
              Yes, that is us
            </Button>
            <Button
              onClick={() => {
                connection.forget();
                setAckClaim(null);
                setCode('');
                setStep('code');
                setProblem(
                  'No problem. Check the code on your card, and tell your teacher which code you tried.',
                );
              }}
            >
              No, that is not us
            </Button>
          </div>
        </section>
      )}

      {shownStep === 'members' && (
        <section className="panel" aria-labelledby="members-heading">
          <h2 id="members-heading">Who is in your group?</h2>
          <p className="hint">
            First names only, and only if you want to. They are used for the jobs on this screen and
            nothing else.
          </p>
          {Array.from({ length: MAX_MEMBERS }, (_, index) => (
            <p className="field" key={index}>
              <label htmlFor={`member-${String(index)}`}>{`First name ${String(index + 1)}`}</label>
              <input
                id={`member-${String(index)}`}
                type="text"
                maxLength={MAX_MEMBER_NAME_CHARS}
                autoComplete="off"
                value={names[index] ?? ''}
                onChange={(event) => {
                  const next = [...names];
                  next[index] = event.target.value;
                  setNames(next);
                  setProblem(null);
                }}
              />
            </p>
          ))}
          {problem !== null && (
            <p className="problem" role="alert">
              {problem}
            </p>
          )}
          <div className="row">
            <Button tone="primary" size="large" onClick={() => void saveNames()} disabled={busy}>
              Save and start
            </Button>
            <Button
              tone="quiet"
              onClick={() => {
                void navigate('/team');
              }}
            >
              Skip
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
