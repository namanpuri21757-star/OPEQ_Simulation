import { useId, useState } from 'react';
import { COUNTRY_LETTERS, COUNTRY_NAMES } from '@shared/constants';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, type Say } from '../ui';

/**
 * The waiting-time question (SPEC section 5): what will the other two produce,
 * and how much do you trust any agreement in your world?
 *
 * It is asked after submitting, so it cannot change the group's own number, and
 * it gives the debrief something real to compare: what they expected against
 * what happened.
 */
const TRUST_WORDS: Record<number, string> = {
  1: '1 - not at all',
  2: '2 - a little',
  3: '3 - somewhat',
  4: '4 - quite a lot',
  5: '5 - completely',
};

export interface PredictionPanelProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
}

export function PredictionPanel({ view, send, onSaid }: PredictionPanelProps) {
  const id = useId();
  const others = COUNTRY_LETTERS.filter((letter) => letter !== view.letter);
  const saved = view.prediction;

  const [guesses, setGuesses] = useState<string[]>(() =>
    others.map((_, index) => {
      const value = saved?.othersTenths[index];
      return value === undefined ? '' : formatQuantity(value);
    }),
  );
  const [trust, setTrust] = useState<number>(saved?.trust ?? 3);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const parsedPair: number[] = [];
    for (const [index, letter] of others.entries()) {
      const parsed = parseQuantity(guesses[index] ?? '', view.settings.capacityTenths);
      if (!parsed.ok) {
        setProblem(`${COUNTRY_NAMES[letter]}: ${parsed.message}`);
        return;
      }
      parsedPair.push(parsed.tenths);
    }
    const pair: [number, number] = [parsedPair[0] ?? 0, parsedPair[1] ?? 0];
    setProblem(null);
    setBusy(true);
    const ack = await send('submitPrediction', { othersTenths: pair, trust });
    setBusy(false);
    if (ack.ok) onSaid?.('Thank you - your guess is saved.', 'good');
    else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  return (
    <section className="panel prediction" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>While you wait</h2>
      <p className="hint">
        Nobody else sees your answers. They are only for the talk at the end of the game.
      </p>

      {others.map((letter, index) => (
        <p className="field" key={letter}>
          <label htmlFor={`${id}-${letter}`}>
            {`What will ${COUNTRY_NAMES[letter]} (${letter}) produce? (million barrels)`}
          </label>
          <input
            id={`${id}-${letter}`}
            type="text"
            inputMode="decimal"
            value={guesses[index] ?? ''}
            onChange={(event) => {
              const next = [...guesses];
              next[index] = event.target.value;
              setGuesses(next);
              setProblem(null);
            }}
          />
        </p>
      ))}

      <fieldset className="trust">
        <legend>How much do you trust any agreement in your world?</legend>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value} className="trust-option" htmlFor={`${id}-trust-${String(value)}`}>
            <input
              id={`${id}-trust-${String(value)}`}
              type="radio"
              name={`${id}-trust`}
              value={value}
              checked={trust === value}
              onChange={() => setTrust(value)}
            />
            {TRUST_WORDS[value]}
          </label>
        ))}
      </fieldset>

      {problem !== null && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}

      <Button onClick={() => void save()} disabled={busy}>
        {saved === null ? 'Save my guess' : 'Save my guess again'}
      </Button>
      {saved !== null && <p className="hint">Saved for this year.</p>}
    </section>
  );
}
