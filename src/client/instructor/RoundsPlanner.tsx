import { useState } from 'react';
import { AUTO_ADVANCE_SECONDS } from '@shared/constants';
import {
  activitiesAfterYear,
  secondsForYear,
  validateSettings,
  type RoundPlan,
  type Settings,
  type SettingsInput,
} from '@shared/settings';
import { Button, DataTable } from '../ui';

/**
 * The round plan: how many rounds, how long each one is, and which of the three
 * communication options each round has (messaging, face to face, every world's
 * totals on the projector), plus whether the game moves on by itself.
 *
 * A lesson that has never been planned here keeps its preset's schedule, so the
 * table starts from what that schedule already does. The first change writes a
 * plan of its own, and from then on the plan is what the server follows.
 */
export interface RoundsPlannerProps {
  draft: SettingsInput;
  problems: Readonly<Record<string, string>>;
  onDraft(next: SettingsInput): void;
}

const MAX_ROUNDS = 40;
const MIN_SECONDS = 5;
const MAX_SECONDS = 3600;

type Flag = 'messaging' | 'faceToFace' | 'seeAllTotals';

const FLAGS: ReadonlyArray<{ key: Flag; label: string }> = [
  { key: 'messaging', label: 'Messaging' },
  { key: 'faceToFace', label: 'Face to face' },
  { key: 'seeAllTotals', label: 'See all world totals' },
];

/** "26 min 30 s", "2 min", "45 s". */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${String(s)} s`;
  return s === 0 ? `${String(m)} min` : `${String(m)} min ${String(s)} s`;
}

/**
 * The rounds the draft stands for. A saved plan is used as it is; without one
 * each round is read off the timers and the schedule (a chat window or summit
 * after Year 3 becomes messaging or face to face in Round 4).
 */
export function roundsOf(draft: SettingsInput): RoundPlan[] {
  if (draft.rounds !== undefined && draft.rounds.length > 0) {
    return draft.rounds.map((round) => ({
      seconds: round.seconds,
      messaging: round.messaging ?? false,
      faceToFace: round.faceToFace ?? false,
      seeAllTotals: round.seeAllTotals ?? true,
    }));
  }
  const checked = validateSettings(draft);
  if (!checked.ok) return [];
  const settings: Settings = checked.settings;
  return Array.from({ length: settings.years }, (_, index) => {
    const year = index + 1;
    const before = activitiesAfterYear(year - 1, settings);
    return {
      seconds: secondsForYear(year, settings),
      messaging: before.some((item) => item.kind === 'chat'),
      faceToFace: before.some((item) => item.kind === 'summit'),
      seeAllTotals: settings.projectorShowsPrices,
    };
  });
}

/**
 * A draft that follows a plan. The old between-years schedule is cleared,
 * because the plan now says when messaging and face-to-face talks happen, and
 * the settings that name a year are kept inside the new number of years.
 */
export function withRounds(draft: SettingsInput, rounds: RoundPlan[]): SettingsInput {
  const years = rounds.length;
  const timers = draft.timers ?? {};
  const producer = draft.newProducer ?? {};
  return {
    ...draft,
    years,
    rounds,
    schedule: [],
    timers: {
      ...timers,
      earlyYearsThrough: Math.min(timers.earlyYearsThrough ?? 3, years),
      perYear: (timers.perYear ?? []).filter((item) => item.year <= years),
    },
    newProducer: { ...producer, year: Math.min(producer.year ?? 9, years) },
  };
}

/** The plan cut or stretched to a number of rounds; new rounds copy the last. */
export function resizeRounds(rounds: RoundPlan[], count: number): RoundPlan[] {
  const last = rounds[rounds.length - 1] ?? {
    seconds: 120,
    messaging: false,
    faceToFace: false,
    seeAllTotals: true,
  };
  const next = rounds.slice(0, count);
  while (next.length < count) next.push({ ...last });
  return next;
}

export function RoundsPlanner({ draft, problems, onDraft }: RoundsPlannerProps) {
  const rounds = roundsOf(draft);
  const [countText, setCountText] = useState<string | null>(null);
  const [secondsText, setSecondsText] = useState<Record<number, string>>({});
  const [everyText, setEveryText] = useState('');

  const practice = draft.timers?.practiceSeconds ?? 120;
  const roundsTotal = rounds.reduce((sum, round) => sum + round.seconds, 0);
  const auto = draft.autoAdvance === true && draft.autoClose === true;

  const save = (next: RoundPlan[]) => onDraft(withRounds(draft, next));

  const setCount = (raw: string) => {
    setCountText(raw);
    if (!/^\d+$/.test(raw.trim())) return;
    const count = Number(raw.trim());
    if (count < 1 || count > MAX_ROUNDS) return;
    setCountText(null);
    setSecondsText({});
    save(resizeRounds(rounds, count));
  };

  const setSeconds = (index: number, raw: string) => {
    setSecondsText((current) => ({ ...current, [index]: raw }));
    if (!/^\d+$/.test(raw.trim())) return;
    const seconds = Number(raw.trim());
    if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) return;
    save(rounds.map((round, i) => (i === index ? { ...round, seconds } : round)));
  };

  const setFlag = (index: number, key: Flag, value: boolean) =>
    save(rounds.map((round, i) => (i === index ? { ...round, [key]: value } : round)));

  const setEvery = () => {
    const seconds = Number(everyText.trim());
    if (!/^\d+$/.test(everyText.trim()) || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return;
    setSecondsText({});
    save(rounds.map((round) => ({ ...round, seconds })));
  };

  const secondsProblem = (index: number): string | null => {
    const raw = secondsText[index];
    if (raw === undefined) return null;
    const ok = /^\d+$/.test(raw.trim()) && Number(raw) >= MIN_SECONDS && Number(raw) <= MAX_SECONDS;
    return ok ? null : `Round ${String(index + 1)}: use ${String(MIN_SECONDS)} to ${String(MAX_SECONDS)} seconds.`;
  };
  const typedProblems = rounds.map((_, index) => secondsProblem(index)).filter(Boolean);
  const countBad =
    countText !== null &&
    (!/^\d+$/.test(countText.trim()) || Number(countText) < 1 || Number(countText) > MAX_ROUNDS);
  const planProblem = problems['rounds'] ?? problems['years'];

  return (
    <div className="stack">
      <div className="field-row">
        <label className="field-label" htmlFor="setting-rounds" style={{ marginBottom: 0 }}>
          Number of rounds
        </label>
        <input
          id="setting-rounds"
          className="field-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={countText ?? String(rounds.length)}
          onChange={(event) => setCount(event.target.value)}
        />
        <span className="field-unit">{`1 to ${String(MAX_ROUNDS)}`}</span>
      </div>
      {countBad && (
        <p className="problem" role="alert">
          {`Type a whole number of rounds from 1 to ${String(MAX_ROUNDS)}.`}
        </p>
      )}

      <div className="field-row">
        <label className="field-label" htmlFor="setting-every" style={{ marginBottom: 0 }}>
          Time for every round
        </label>
        <input
          id="setting-every"
          className="field-number"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="120"
          value={everyText}
          onChange={(event) => setEveryText(event.target.value)}
        />
        <span className="field-unit">seconds</span>
        <Button onClick={setEvery}>Apply to all rounds</Button>
      </div>

      <DataTable
        caption="Round plan"
        hideCaption
        columns={['Round', 'Time (seconds)', ...FLAGS.map((flag) => flag.label)]}
        rows={rounds.map((round, index) => {
          const n = String(index + 1);
          return [
            `Round ${n}`,
            <input
              key="seconds"
              className="field-number"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-label={`Round ${n} time in seconds`}
              value={secondsText[index] ?? String(round.seconds)}
              onChange={(event) => setSeconds(index, event.target.value)}
            />,
            ...FLAGS.map((flag) => (
              <input
                key={flag.key}
                type="checkbox"
                aria-label={`Round ${n}: ${flag.label}`}
                checked={round[flag.key]}
                onChange={(event) => setFlag(index, flag.key, event.target.checked)}
              />
            )),
          ];
        })}
      />

      {typedProblems.length > 0 && (
        <div role="alert">
          {typedProblems.map((message) => (
            <p className="problem" key={message}>
              {message}
            </p>
          ))}
        </div>
      )}
      {planProblem !== undefined && (
        <p className="problem" role="alert">
          {planProblem}
        </p>
      )}

      <p className="num" aria-live="polite">
        {`Total simulation time: ${clock(roundsTotal + practice)}`}
      </p>
      <p className="note">
        {`${String(rounds.length)} rounds take ${clock(roundsTotal)}, plus ${clock(practice)} for the practice year.`}
        {auto ? ` Each round can end sooner, as soon as every country has submitted.` : ''}
      </p>

      <p className="field field-check">
        <input
          id="setting-auto-advance"
          type="checkbox"
          checked={auto}
          onChange={(event) =>
            onDraft({
              ...draft,
              autoClose: event.target.checked,
              autoAdvance: event.target.checked,
            })
          }
        />
        <label htmlFor="setting-auto-advance">Move on by itself</label>
        <span className="note">
          {`A round ends as soon as every country has submitted, and the next one starts after ${String(AUTO_ADVANCE_SECONDS)} seconds of results.`}
        </span>
      </p>
    </div>
  );
}
