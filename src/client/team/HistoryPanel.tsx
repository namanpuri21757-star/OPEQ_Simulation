import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { TeamView, YearRowView } from '@shared/views';
import { DataTable, LineChart } from '../ui';

/**
 * Every year so far: the table and the chart (SPEC 8.3).
 *
 * Which columns exist depends on the disclosure mode, and that decision is made
 * on the server: a row simply has null where this team may not look, so there is
 * nothing here that could leak by accident (CLAUDE.md rule 2).
 */
function quantityCell(tenths: number | null, auto: boolean): string {
  if (tenths === null) return 'not shown';
  return auto ? `${formatQuantity(tenths)} (auto)` : formatQuantity(tenths);
}

export function historyColumns(view: TeamView): string[] {
  const columns = ['Year', 'Price', 'Your output', 'Your profit', 'Your total so far'];
  if (view.settings.disclosure !== 'priceOnly') columns.push('World output');
  if (view.settings.disclosure === 'full') {
    const first = view.history[0];
    for (const other of first?.others ?? []) columns.push(`${other.countryName} output`);
  }
  return columns;
}

function row(view: TeamView, record: YearRowView): string[] {
  const cells = [
    record.label,
    formatPrice(record.priceCents),
    quantityCell(record.ownActualTenths, record.ownAuto),
    formatProfitK(record.ownProfitK),
    record.isPractice ? 'not counted' : formatProfitK(record.cumulativeProfitK),
  ];
  if (view.settings.disclosure !== 'priceOnly') {
    cells.push(record.totalTenths === null ? 'not shown' : formatQuantity(record.totalTenths));
  }
  if (view.settings.disclosure === 'full') {
    for (const other of record.others ?? []) {
      cells.push(quantityCell(other.actualTenths, other.auto));
    }
  }
  return cells;
}

export function HistoryPanel({ view }: { view: TeamView }) {
  if (view.history.length === 0) {
    return (
      <section className="panel history" aria-labelledby="history-heading">
        <h2 id="history-heading">Your years</h2>
        <p className="hint">Your first result will appear here.</p>
      </section>
    );
  }

  const scored = view.history.filter((record) => !record.isPractice);
  const shown = scored.length > 0 ? scored : view.history;

  return (
    <section className="panel history" aria-labelledby="history-heading">
      <h2 id="history-heading">Your years</h2>
      <DataTable
        caption="Every year so far"
        columns={historyColumns(view)}
        rows={view.history.map((record) => row(view, record))}
        hideCaption
      />
      <LineChart
        title="Price and your output, year by year"
        series={[
          {
            name: 'Price',
            points: shown.map((record) => ({ x: record.year, y: record.priceCents })),
            marker: 'circle',
          },
          {
            name: 'Your output',
            points: shown.map((record) => ({ x: record.year, y: record.ownActualTenths })),
            axis: 'right',
            marker: 'square',
            dash: '6 4',
          },
        ]}
        xLabel="Year"
        leftLabel="$ per barrel"
        rightLabel="million barrels"
        formatX={(x) => (x === 0 ? 'Practice' : String(x))}
        formatLeft={(y) => formatPrice(y)}
        formatRight={(y) => formatQuantity(y)}
      />
    </section>
  );
}
