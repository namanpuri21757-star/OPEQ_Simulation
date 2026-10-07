import type { ReactNode } from 'react';

/**
 * A plain table with a caption and real header cells.
 *
 * Every chart in this app has one of these behind it (SPEC section 9), and the
 * history and leaderboard screens use it directly, so there is one place where
 * scope="col" and scope="row" are set correctly.
 */
export interface DataTableProps {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<readonly ReactNode[]>;
  /** The column that names each row. 0 by default; -1 for none. */
  rowHeader?: number;
  /** Hides the caption from the screen but keeps it for screen readers. */
  hideCaption?: boolean;
}

export function DataTable({
  caption,
  columns,
  rows,
  rowHeader = 0,
  hideCaption = false,
}: DataTableProps) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <caption className={hideCaption ? 'visually-hidden' : undefined}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === rowHeader ? (
                  <th key={cellIndex} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
