import type { DebriefData, DebriefWorld, DebriefYear } from '@shared/debrief';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import { Badge, DataTable, LineChart, type ChartMark, type ChartSeries } from '../ui';
import { styleFor } from './series';

/**
 * World Detail (SPEC 8.4): one world, year by year, with the moments that
 * mattered marked on it.
 *
 * Five things, in the order a teacher asks about them: what each country
 * produced and what that did to the price; what they promised each other and
 * whether they kept it; what they expected the others to do; and whose
 * suggestion became the decision.
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

  const hadHuddles = world.countries.some((country) => country.huddles.length > 0);
  const hadPredictions = world.countries.some((country) => country.predictions.length > 0);

  return (
    <section className="debrief-screen" aria-labelledby="detail-heading">
      <h2 id="detail-heading">{world.title}</h2>
      <p className="debrief-lead">{world.break.note}</p>

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

      <DataTable
        caption="Every year in this world"
        columns={[
          'Year',
          'World supply',
          'Price',
          'Profit for all three',
          'Share of the best possible',
          'Furthest above an equal share',
        ]}
        rows={world.years.map((year) => [
          year.label,
          formatQuantity(year.totalTenths),
          formatPrice(year.priceCents),
          formatProfitK(year.jointProfitK),
          `${String(year.percentOfMax)}%`,
          furthestAbove(year),
        ])}
      />

      <h3>What they said, and what they did</h3>
      {world.messages.length === 0 ? (
        <p>Nobody in this world sent a message.</p>
      ) : (
        <ol className="debrief-timeline" aria-label="Message timeline">
          {world.messages.map((message) => (
            <li key={message.messageId} className={`timeline-${message.kind}`}>
              <span className="timeline-who">
                {message.countryName === null ? 'Your teacher' : message.countryName}
                {message.letter !== null && <Badge letter={message.letter} />}
              </span>
              <span className="timeline-when">
                {message.year === null
                  ? 'after the last year'
                  : `before Year ${String(message.year)}`}
              </span>
              <span className="timeline-text">{message.text}</span>
              {message.kept !== null && (
                <span className={message.kept ? 'timeline-kept' : 'timeline-broken'}>
                  {message.kept
                    ? `kept it: produced ${formatQuantity(message.actualTenths ?? 0)}`
                    : `did not: produced ${formatQuantity(message.actualTenths ?? 0)}`}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      <DataTable
        caption="Promises kept, by country"
        columns={['Country', 'Promises made', 'Promises kept', 'Total profit']}
        rows={world.countries.map((country) => [
          `${country.countryName} (${country.letter})`,
          String(country.pledgesMade),
          country.pledgesMade === 0 ? '-' : String(country.pledgesKept),
          formatProfitK(country.cumulativeProfitK),
        ])}
      />

      <h3>What they expected the others to do</h3>
      {hadPredictions ? (
        <DataTable
          caption="Guesses against what really happened"
          columns={[
            'Country',
            'Year',
            'Guess for the other two',
            'What they really produced',
            'How far out',
            'Trust (1 to 5)',
          ]}
          rows={world.countries.flatMap((country) =>
            country.predictions.map((row) => [
              `${country.countryName} (${country.letter})`,
              `Year ${String(row.year)}`,
              formatQuantity(row.predictedTenths),
              formatQuantity(row.actualTenths),
              formatQuantity(row.errorTenths),
              String(row.trust),
            ]),
          )}
        />
      ) : (
        <p>No group in this world filled in the waiting-time question.</p>
      )}

      <h3>Whose suggestion became the decision</h3>
      {hadHuddles ? (
        <>
          <DataTable
            caption="Huddle suggestions against the number the group sent"
            columns={['Country', 'Year', 'Suggestions', 'Decision']}
            rows={world.countries.flatMap((country) =>
              country.huddles.map((huddle) => [
                `${country.countryName} (${country.letter})`,
                `Year ${String(huddle.year)}`,
                huddle.suggestions
                  .map(
                    (suggestion) =>
                      `${suggestion.name} ${formatQuantity(suggestion.tenths)}${suggestion.matched ? ' (this one)' : ''}`,
                  )
                  .join(', '),
                formatQuantity(huddle.decisionTenths),
              ]),
            )}
          />
          <DataTable
            caption="How often each member's number was the one sent"
            columns={['Country', 'Member', 'Suggestions', 'Times it was the decision']}
            rows={world.countries.flatMap((country) =>
              country.memberMatches.map((match) => [
                `${country.countryName} (${country.letter})`,
                match.name,
                String(match.suggestions),
                String(match.matched),
              ]),
            )}
          />
        </>
      ) : (
        <p>No group in this world recorded a huddle.</p>
      )}
    </section>
  );
}
