import type { ReactNode } from 'react';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { TeamView, YearRowView } from '@shared/views';
import { DataTable, LineChart } from '../ui';

/**
 * Every year so far: one row per year, newest first, and one chart (SPEC 8.3).
 *
 * Which columns exist depends on the disclosure mode, and that decision is made
 * on the server: a row simply has null where this team may not look, so there is
 * nothing here that could leak by accident (CLAUDE.md rule 2).
 *
 * Newest first, because the row a group reads while deciding is last year's and
 * it should not have to scroll past eleven others to find it.
 */
function quantityCell(tenths: number | null, auto: boolean) {
  if (tenths === null) return 'not shown';
  return auto ? (
    <>
      {formatQuantity(tenths)}
      <span className="auto-mark">auto</span>
    </>
  ) : (
    formatQuantity(tenths)
  );
}

export function historyColumns(view: TeamView): string[] {
  const first = view.history[0];
  const columns = [`Year`, `${view.countryName} (you)`];
  if (view.settings.disclosure === 'full') {
    for (const other of first?.others ?? []) columns.push(other.countryName);
    // "Other suppliers" only exists once there are any, and only under full
    // disclosure: a column of zeros would announce the new producer early.
    if (view.history.some((row) => (row.newProducerTenths ?? 0) > 0)) {
      columns.push('Other suppliers');
    }
  }
  if (view.settings.disclosure !== 'priceOnly') columns.push('World total');
  columns.push('Price', 'Your profit');
  return columns;
}

function row(view: TeamView, record: YearRowView) {
  const cells: ReactNode[] = [
    record.label,
    quantityCell(record.ownActualTenths, record.ownAuto),
  ];
  if (view.settings.disclosure === 'full') {
    for (const other of record.others ?? []) {
      cells.push(quantityCell(other.actualTenths, other.auto));
    }
    if (view.history.some((r) => (r.newProducerTenths ?? 0) > 0)) {
      cells.push(record.newProducerTenths === null ? '-' : formatQuantity(record.newProducerTenths));
    }
  }
  if (view.settings.disclosure !== 'priceOnly') {
    cells.push(record.totalTenths === null ? 'not shown' : formatQuantity(record.totalTenths));
  }
  cells.push(formatPrice(record.priceCents), formatProfitK(record.ownProfitK));
  return cells;
}

export function HistoryPanel({ view }: { view: TeamView }) {
  if (view.history.length === 0) {
    return (
      <section className="box" aria-labelledby="history-heading">
        <h2 id="history-heading">Results</h2>
        <p className="note">Your first result will appear here.</p>
      </section>
    );
  }

  const newestFirst = [...view.history].reverse();
  // The practice year is not a score, so it is left off the chart entirely
  // (SPEC section 3). The table still shows it, marked as practice.
  const scored = view.history.filter((record) => !record.isPractice);

  return (
    <section className="box" aria-labelledby="history-heading">
      <div className="box-head">
        <h2 id="history-heading">Results</h2>
        <span className="label label-muted">Newest year first</span>
      </div>

      <DataTable
        caption="Every year so far"
        columns={historyColumns(view)}
        rows={newestFirst.map((record) => row(view, record))}
        isPractice={(index) => newestFirst[index]?.isPractice === true}
        hideCaption
      />

      {scored.length > 1 && (
        <div style={{ marginTop: 'var(--s5)' }}>
          <LineChart
            title="Price by year"
            series={[
              {
                name: 'Price',
                points: scored.map((record) => ({ x: record.year, y: record.priceCents })),
                marker: 'circle',
              },
            ]}
            xLabel="Year"
            leftLabel="$ per barrel"
            formatX={(x) => String(x)}
            formatLeft={(y) => formatPrice(y)}
            source="Your world's own price, scored years only. The practice year is left out."
          />
        </div>
      )}
    </section>
  );
}
