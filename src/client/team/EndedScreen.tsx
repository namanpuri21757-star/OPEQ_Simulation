import { useState } from 'react';
import { MAX_REFLECTION_CHARS } from '@shared/protocol';
import { formatProfitK, formatQuantity, formatPrice } from '@shared/units';
import type { TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { Button, DataTable, LineChart, type ChartSeries, type Say } from '../ui';
import { HistoryPanel } from './HistoryPanel';

/**
 * The end of the game (SPEC 8.3): your own years, three questions to think about,
 * and - only once the teacher releases them - the other worlds and the table of
 * who earned what.
 *
 * Nothing about another world appears before that moment, because the view simply
 * does not carry it (CLAUDE.md rule 2).
 */
const QUESTIONS = [
  'When did your world cooperate best, and why?',
  'Did any promise get broken, and how did your group react?',
  'What would you do differently?',
];

export interface EndedScreenProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
}

function worldChart(view: TeamView): ChartSeries[] {
  const scored = view.history.filter((record) => !record.isPractice);
  const own: ChartSeries = {
    name: `${view.countryName} (you)`,
    points: scored.map((record) => ({ x: record.year, y: record.ownActualTenths })),
    marker: 'circle',
  };
  const first = scored[0];
  if (!first?.others) return [own];

  const others = first.others.map((other, index): ChartSeries => {
    const marker = index === 0 ? ('square' as const) : ('triangle' as const);
    return {
      name: other.countryName,
      marker,
      dash: index === 0 ? '6 4' : '2 3',
      points: scored.flatMap((record) => {
        const line = record.others?.find((item) => item.letter === other.letter);
        return line?.actualTenths === null || line?.actualTenths === undefined
          ? []
          : [{ x: record.year, y: line.actualTenths }];
      }),
    };
  });
  return [own, ...others];
}

export function EndedScreen({ view, send, onSaid }: EndedScreenProps) {
  const saved = view.reflection;
  const [answers, setAnswers] = useState<string[]>(
    () => saved?.answers.slice(0, 3) ?? ['', '', ''],
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    const trio: [string, string, string] = [answers[0] ?? '', answers[1] ?? '', answers[2] ?? ''];
    const ack = await send('submitReflection', { answers: trio });
    setBusy(false);
    if (ack.ok) onSaid?.('Thank you - your answers are saved.', 'good');
    else {
      setProblem(ack.message);
      onSaid?.(ack.message, 'bad');
    }
  };

  const leaderboard = view.leaderboard;
  const lastScored = [...view.history].reverse().find((record) => !record.isPractice);

  return (
    <>
      <section className="panel" aria-labelledby="ended-heading">
        <h2 id="ended-heading">The game has finished</h2>
        <p>
          {lastScored
            ? `${view.countryName} earned ${formatProfitK(lastScored.cumulativeProfitK)} in total.`
            : 'No years were scored in this game.'}
        </p>
      </section>

      <HistoryPanel view={view} />

      <section className="panel reflection" aria-labelledby="reflect-heading">
        <h2 id="reflect-heading">Three questions</h2>
        <p className="hint">
          Your answers go to your teacher for the talk at the end. Up to
          {` ${String(MAX_REFLECTION_CHARS)} `}
          characters each.
        </p>
        {QUESTIONS.map((question, index) => (
          <p className="field" key={question}>
            <label htmlFor={`reflect-${String(index)}`}>{question}</label>
            <textarea
              id={`reflect-${String(index)}`}
              rows={3}
              maxLength={MAX_REFLECTION_CHARS}
              value={answers[index] ?? ''}
              onChange={(event) => {
                const next = [...answers];
                next[index] = event.target.value;
                setAnswers(next);
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
        <Button tone="primary" onClick={() => void save()} disabled={busy}>
          Save our answers
        </Button>
        {saved !== null && <p className="hint">Saved. You can change them and save again.</p>}
      </section>

      {leaderboard !== null && (
        <>
          <section className="panel" aria-labelledby="world-chart-heading">
            <h2 id="world-chart-heading">Your world, year by year</h2>
            <LineChart
              title="Output by country"
              series={worldChart(view)}
              xLabel="Year"
              leftLabel="million barrels"
              formatX={(x) => String(x)}
              formatLeft={(y) => formatQuantity(y)}
            />
            <LineChart
              title="The price in your world"
              series={[
                {
                  name: 'Price',
                  points: view.history
                    .filter((record) => !record.isPractice)
                    .map((record) => ({ x: record.year, y: record.priceCents })),
                  marker: 'circle',
                },
              ]}
              xLabel="Year"
              leftLabel="$ per barrel"
              formatX={(x) => String(x)}
              formatLeft={(y) => formatPrice(y)}
              height={200}
            />
          </section>

          <section className="panel" aria-labelledby="leaderboard-heading">
            <h2 id="leaderboard-heading">Every country in the class</h2>
            <DataTable
              caption="Total profit, every world"
              columns={['Country', 'Total profit']}
              rows={leaderboard.countries.map((row) => [
                row.label,
                formatProfitK(row.cumulativeProfitK),
              ])}
            />
            <DataTable
              caption="Each world together"
              columns={['World', 'Total profit', 'Share of the best possible']}
              rows={leaderboard.worlds.map((row) => [
                `World ${String(row.worldNumber)}`,
                formatProfitK(row.totalProfitK),
                row.cooperativeMaxK === 0
                  ? '-'
                  : `${String(Math.round((row.totalProfitK / row.cooperativeMaxK) * 100))}%`,
              ])}
            />
          </section>
        </>
      )}
    </>
  );
}
