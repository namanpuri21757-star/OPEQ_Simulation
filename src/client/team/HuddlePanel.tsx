import { useId, useState } from 'react';
import { MAX_HUDDLE_REASON_CHARS } from '@shared/protocol';
import { formatQuantity, parseQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, type Say } from '../ui';

/**
 * The huddle (SPEC section 5): what each member wanted, and one reason.
 *
 * It is private to the group and the teacher, and it is optional. Its job is the
 * debrief question "whose suggestion became the group's decision?", so it records
 * what people said before the group settled on one number.
 */
export interface HuddlePanelProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
}

export function HuddlePanel({ view, send, onSaid }: HuddlePanelProps) {
  const id = useId();
  const members = view.members.length > 0 ? view.members : ['Member 1', 'Member 2', 'Member 3'];
  const saved = view.huddle;

  const [numbers, setNumbers] = useState<string[]>(() =>
    members.map((name) => {
      const found = saved?.suggestions.find((item) => item.name === name);
      return found ? formatQuantity(found.tenths) : '';
    }),
  );
  const [reason, setReason] = useState(saved?.reason ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const suggestions: Array<{ name: string; tenths: number }> = [];
    for (const [index, name] of members.entries()) {
      const text = numbers[index] ?? '';
      if (text.trim() === '') continue;
      const parsed = parseQuantity(text, view.settings.capacityTenths);
      if (!parsed.ok) {
        setProblem(`${name}: ${parsed.message}`);
        return;
      }
      suggestions.push({ name, tenths: parsed.tenths });
    }
    setProblem(null);
    setBusy(true);
    const ack = await send('recordHuddle', { suggestions, reason });
    setBusy(false);
    if (ack.ok) onSaid?.('Huddle saved.', 'good');
    else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  return (
    <section className="panel huddle" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Huddle</h2>
      <p className="hint">
        Before you submit, write down what each of you suggested and one reason. Only your group and
        your teacher ever see this.
      </p>

      {members.map((name, index) => (
        <p className="field" key={name}>
          <label htmlFor={`${id}-${String(index)}`}>{`${name} suggests (million barrels)`}</label>
          <input
            id={`${id}-${String(index)}`}
            type="text"
            inputMode="decimal"
            value={numbers[index] ?? ''}
            onChange={(event) => {
              const next = [...numbers];
              next[index] = event.target.value;
              setNumbers(next);
              setProblem(null);
            }}
          />
        </p>
      ))}

      <p className="field">
        <label htmlFor={`${id}-reason`}>Our reason, in one line</label>
        <input
          id={`${id}-reason`}
          type="text"
          maxLength={MAX_HUDDLE_REASON_CHARS}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </p>

      {problem !== null && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}

      <Button onClick={() => void save()} disabled={busy}>
        Save our huddle
      </Button>
      {saved !== null && <p className="hint">Saved for this year. Saving again replaces it.</p>}
    </section>
  );
}
