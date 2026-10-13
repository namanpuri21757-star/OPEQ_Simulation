import type { DebriefData, DebriefWorld, DebriefYear } from '@shared/debrief';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import { Badge, DataTable, LineChart, type ChartMark, type ChartSeries } from '../ui';
import { styleFor } from './series';

/**
 * World Detail (SPEC 8.4): one world, year by year, with the moments that
 * mattered marked on it.
 *
 * Three things, in the order a teacher asks about them: what each country
 * produced and what that did to the price, every year as a table, and what the
 * three of them said to each other along the way.
 */
export interface WorldDetailProps {
  debrief: DebriefData;
  /** Which world to show. Falls back to the first one. */
  worldNumber: number | null;
}

function outputChart(world: DebriefWorld): ChartSeries[] {
  const countries = world.years[0]?.countries ?? [];
  const series: ChartSeries[] = countries.map((country, index) => ({
    name: `${country.countryName} (${country.letter})`,
    points: world.years.flatMap((year) => {
      const row = year.countries.find((item) => item.letter === country.letter);
      return row ? [{ x: year.year, y: row.actualTenths }] : [];
    }),
    ...styleFor(index),
  }));

  // The price belongs on this chart, not a second one: the whole lesson is that
  // the two move together. It gets the right-hand axis and its own shape.
  series.push({
    name: 'Price',
    axis: 'right',
    points: world.years.map((year) => ({ x: year.year, y: year.priceCents })),
    ...styleFor(4),
  });
  return series;
}

/**
 * Who went furthest over an equal share that year.
 *
 * This is the column a teacher points at when the room asks "so who broke it?":
 * an equal share of the best joint total is the line, and this says who crossed
 * it and by how much.
 */
function furthestAbove(year: DebriefYear): string {
  const top = [...year.countries].sort((x, y) => y.aboveSharePct - x.aboveSharePct)[0];
  if (!top || top.aboveSharePct <= 0) return 'nobody above it';
  return `${top.countryName} +${String(top.aboveSharePct)}%`;
}

function marksOf(world: DebriefWorld): ChartMark[] {
  return world.markers.map((marker) => ({ x: marker.year, label: marker.label }));
}

export function WorldDetail({ debrief, worldNumber }: WorldDetailProps) {
  const world =
    debrief.worlds.find((item) => item.worldNumber === worldNumber) ?? debrief.worlds[0];

  if (!world || world.years.length === 0) {
    return (
      <section className="debrief-screen" aria-labelledby="detail-heading">
        <h2 id="detail-heading">{world?.title ?? 'No world to show'}</h2>
        <p>No year has been scored in this world yet.</p>
      </section>
    );
  }

  const letters = world.years[0]?.countries ?? [];

  // Read top to bottom: how each country finished, how the world moved, every
  // round in numbers, and what was said along the way.
  return (
    <section className="debrief-screen" aria-labelledby="detail-heading">
      <h2 id="detail-heading">{world.title}</h2>
      <p className="debrief-lead">{world.break.note}</p>

      <DataTable
        caption="Each country in this world"
        columns={['Country', 'Total profit ($M)', 'Messages sent']}
        rows={world.countries.map((country) => [
          `${country.countryName} (${country.letter})`,
          formatProfitK(country.cumulativeProfitK),
          String(country.messagesSent),
        ])}
      />

      <LineChart
        title="What each country produced, and what the price did"
        series={outputChart(world)}
        marks={marksOf(world)}
        xLabel="Year"
        leftLabel="million barrels"
        rightLabel="$ per barrel"
        formatLeft={(y) => formatQuantity(y)}
        formatRight={(y) => formatPrice(y)}
        height={300}
      />

      <h3>Round by round</h3>
      <DataTable
        caption="Every year in this world"
        columns={[
          'Year',
          ...letters.map((country) => `${country.countryName} produced`),
          'World supply',
          'Price',
          'Profit for all three',
          'Share of the best possible',
          'Furthest above an equal share',
        ]}
        rows={world.years.map((year) => [
          year.label,
          ...letters.map((country) => {
            const row = year.countries.find((item) => item.letter === country.letter);
            if (!row) return '-';
            return `${formatQuantity(row.actualTenths)}${row.auto ? ' auto' : ''}`;
          }),
          formatQuantity(year.totalTenths),
          formatPrice(year.priceCents),
          formatProfitK(year.jointProfitK),
          `${String(year.percentOfMax)}%`,
          furthestAbove(year),
        ])}
      />
      <p className="chart-source">
        Output and supply in million barrels. Price in $ per barrel. Auto means the country did not
        submit and repeated its last number.
      </p>

      <h3>What they said, and what they did</h3>
      {world.messages.length === 0 ? (
        <p>Nobody in this world sent a message.</p>
      ) : (
        <ol className="debrief-timeline" aria-label="Message timeline">
          {world.messages.map((message) => (
            <li key={message.messageId}>
              <span className="timeline-who">
                <Badge letter={message.letter} size="small" />
                {message.countryName}
              </span>
              <span className="timeline-when">
                {message.year === null
                  ? 'after the last year'
                  : `before Year ${String(message.year)}`}
              </span>
              <span className="timeline-text">{message.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
