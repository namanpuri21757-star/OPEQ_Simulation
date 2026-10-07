import { useState } from 'react';
import { priceCents, profitK } from '@shared/engine/engine';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { PublicSettingsView } from '@shared/views';
import { Button } from '../ui';
import { clientUnits } from './economics';

/**
 * The three-question check at the end of the briefing (SPEC 8.3).
 *
 * It is not graded and nobody sees the answers. Every number in it is worked out
 * from this session's own settings with the engine the server scores with, so a
 * teacher who changes the price line does not leave a wrong quiz behind.
 *
 * Feedback is instant and kind, and a wrong answer can be tried again, because
 * the point is to understand the price line before the practice year starts.
 */
interface Choice {
  text: string;
  correct?: boolean;
}

interface Question {
  ask: string;
  choices: Choice[];
  because: string;
}

/**
 * Drops a wrong answer that happens to read the same as the right one. With a
 * cost of 0 "profit" and "price times barrels" are the same number, and a
 * question with two identical choices looks broken.
 */
function dedupe(choices: Choice[]): Choice[] {
  const seen = new Set<string>();
  return choices.filter((choice) => {
    if (seen.has(choice.text)) return false;
    seen.add(choice.text);
    return true;
  });
}

export function questionsFor(settings: PublicSettingsView): Question[] {
  const units = clientUnits(settings);
  const own = units.startingOutputTenths;
  const total = own * 3;
  const price = priceCents(total, units.aCents, units.bHundredths);
  const profit = profitK(price, units.costCents, own);
  const a = formatPrice(units.aCents);

  const questions: Question[] = [
    {
      ask: `If the world produces ${formatQuantity(total)} million barrels, what is the price?`,
      choices: [
        { text: formatPrice(price), correct: true },
        { text: a },
        { text: formatPrice(units.aCents - units.bHundredths) },
      ],
      because: `The price starts at ${a} and falls by $${String(settings.b)} for every million barrels the whole world produces. ${a} - $${String(settings.b)} x ${formatQuantity(total)} = ${formatPrice(price)}.`,
    },
    {
      ask: `If the price is ${formatPrice(price)} and you produce ${formatQuantity(own)} million barrels, what is your profit?`,
      choices: [
        { text: formatProfitK(profit), correct: true },
        { text: formatProfitK(profitK(price, 0, own)) },
        { text: formatProfitK(price - units.costCents) },
      ],
      because: `Profit is (price - cost) x your barrels. (${formatPrice(price)} - ${formatPrice(units.costCents)}) x ${formatQuantity(own)} = ${formatProfitK(profit)}.`,
    },
    {
      ask: 'If every country produces more, what happens to the price?',
      choices: [
        { text: 'It goes down.', correct: true },
        { text: 'It goes up.' },
        { text: 'It stays the same.' },
      ],
      because:
        'More barrels for sale means a lower price for everyone, including the country that produced the extra barrels.',
    },
  ];
  // Each question's choices are turned by a different amount, so the right
  // answer is not always the first button and nobody learns to just click left.
  return questions.map((question, index) => {
    const choices = dedupe(question.choices);
    const turn = (index + 1) % choices.length;
    return { ...question, choices: [...choices.slice(turn), ...choices.slice(0, turn)] };
  });
}

export function BriefingCheck({ settings }: { settings: PublicSettingsView }) {
  const questions = questionsFor(settings);
  const [picked, setPicked] = useState<Array<number | null>>(questions.map(() => null));

  return (
    <section className="panel check" aria-labelledby="check-heading">
      <h2 id="check-heading">Quick check</h2>
      <p className="hint">
        Three questions to see if the price line makes sense. Nobody is marked and nobody else sees
        your answers.
      </p>

      <ol className="check-list">
        {questions.map((question, index) => {
          const chosen = picked[index] ?? null;
          const right = chosen !== null && (question.choices[chosen]?.correct ?? false);
          return (
            <li key={question.ask}>
              <fieldset>
                <legend>{question.ask}</legend>
                <div className="check-choices">
                  {question.choices.map((choice, choiceIndex) => (
                    <Button
                      key={choiceIndex}
                      tone={chosen === choiceIndex ? 'primary' : 'secondary'}
                      aria-pressed={chosen === choiceIndex}
                      onClick={() => {
                        const next = [...picked];
                        next[index] = choiceIndex;
                        setPicked(next);
                      }}
                    >
                      {choice.text}
                    </Button>
                  ))}
                </div>
              </fieldset>
              <p className="check-feedback" role="status">
                {chosen === null
                  ? ''
                  : right
                    ? `Yes, that is right. ${question.because}`
                    : `Not quite - have another go. ${question.because}`}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
