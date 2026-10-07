import type { DebriefData } from '@shared/debrief';
import { formatProfitK } from '@shared/units';
import { DataTable, LineChart, type ChartSeries } from '../ui';
import { styleFor } from './series';

/**
 * World Comparison (SPEC 8.4): how much of the cooperative maximum each world
 * kept, year by year and in total.
 *
 * The title is the finding, worked out from the data on the server, so the
 * instructor screen and the projector always say the same sentence.
 */
export interface WorldComparisonProps {
  debrief: DebriefData;
}

export function WorldComparison({ debrief }: WorldComparisonProps) {
  const played = debrief.worlds.filter((world) => world.years.length > 0);

  if (played.length === 0) {
    return (
      <section className="debrief-screen" aria-labelledby="comparison-heading">
        <h2 id="comparison-heading">{debrief.titles.comparison}</h2>
        <p>No year has been scored yet, so there is nothing to compare.</p>
      </section>
    );
  }

  const perYear: ChartSeries[] = played.map((world, index) => ({
    name: world.label,
    points: world.years.map((year) => ({ x: year.year, y: year.percentOfMax })),
    ...styleFor(index),
  }));

  const cumulative: ChartSeries[] = played.map((world, index) => ({
    name: world.label,
    points: world.years.map((year) => ({ x: year.year, y: year.cumulativePercentOfMax })),
    ...styleFor(index),
  }));

  return (
    <section className="debrief-screen" aria-labelledby="comparison-heading">
      <h2 id="comparison-heading">{debrief.titles.comparison}</h2>
      <p className="debrief-lead">
        100% would mean the three countries in a world made every dollar they possibly could have
        made together that year. Anything less went to the people buying the oil.
      </p>

      <LineChart
        title="Share of the cooperative maximum, year by year"
        series={perYear}
        xLabel="Year"
        leftLabel="percent"
        formatLeft={(y) => `${String(y)}%`}
      />

      <LineChart
        title="Share of the cooperative maximum, counting from Year 1"
        series={cumulative}
        xLabel="Year"
        leftLabel="percent"
        formatLeft={(y) => `${String(y)}%`}
      />

      <DataTable
        caption="Each world over the whole game"
        columns={[
          'World',
          'Total profit',
          'The most it could have made',
          'Share kept',
          'Cooperation broke',
        ]}
        rows={played.map((world) => [
          world.label,
          formatProfitK(world.totalProfitK),
          formatProfitK(world.cooperativeMaxK),
          `${String(world.percentOfMax)}%`,
          world.break.year === null ? 'it did not' : `Year ${String(world.break.year)}`,
        ])}
      />
    </section>
  );
}
