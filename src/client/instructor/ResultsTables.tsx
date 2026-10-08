import { COUNTRY_LETTERS } from '@shared/constants';
import { formatPrice, formatQuantity } from '@shared/units';
import type { InstructorView } from '@shared/views';
import { DataTable } from '../ui';

/**
 * One compact table per world, newest year at the top (SPEC 8.4).
 *
 * Newest first because the row a teacher reads out loud is the one that just
 * closed. Each table holds the three countries' output, the total and the price:
 * the same columns the room sees, so the teacher is never reading a different
 * set of numbers from the class.
 */
export function ResultsTables({ view }: { view: InstructorView }) {
  const anyPlayed = view.worlds.some((world) => world.records.length > 0);
  if (!anyPlayed) return null;

  return (
    <section className="box" aria-labelledby="results-heading">
      <div className="box-head">
        <h2 id="results-heading">Results</h2>
        <span className="label label-muted">Million barrels, newest year first</span>
      </div>

      <div className="world-results">
        {view.worlds.map((world) => {
          const rows = [...world.records].reverse();
          return (
            <DataTable
              key={world.worldId}
              caption={`World ${String(world.worldNumber)}`}
              columns={['Year', 'A', 'B', 'C', 'Total', 'Price']}
              rows={rows.map((record) => [
                record.isPractice ? 'PRACTICE' : String(record.year),
                ...COUNTRY_LETTERS.map((letter) => {
                  const country = record.countries.find((item) => item.letter === letter);
                  return country === undefined ? '-' : formatQuantity(country.actualTenths);
                }),
                formatQuantity(record.totalTenths),
                formatPrice(record.priceCents),
              ])}
              isPractice={(index) => rows[index]?.isPractice === true}
            />
          );
        })}
      </div>
    </section>
  );
}
