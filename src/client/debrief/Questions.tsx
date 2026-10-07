import type { DebriefData, DebriefScreen } from '@shared/debrief';
import { Button } from '../ui';

/**
 * The ten debrief questions (SPEC section 10), with this session's numbers in
 * them and a link to the screen that answers each one.
 *
 * On the projector there is nothing to press, so the buttons are simply left
 * out: the same component serves both screens.
 */
export interface QuestionsProps {
  debrief: DebriefData;
  /** Jumps the instructor screen to the evidence. Left out on the projector. */
  onShowEvidence?: (screen: DebriefScreen) => void;
}

export function Questions({ debrief, onShowEvidence }: QuestionsProps) {
  return (
    <section className="debrief-screen" aria-labelledby="questions-heading">
      <h2 id="questions-heading">{debrief.titles.questions}</h2>
      <ol className="debrief-questions">
        {debrief.questions.map((question) => (
          <li key={question.number}>
            <p className="question-text">{question.text}</p>
            <p className="question-meta">
              <span className="question-goal">{question.goal}</span>
              {onShowEvidence && (
                <Button onClick={() => onShowEvidence(question.evidence)}>
                  {`Show evidence: ${question.evidenceLabel}`}
                </Button>
              )}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
