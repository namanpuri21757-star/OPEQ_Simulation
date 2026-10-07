import { useEffect } from 'react';

/**
 * Opens the fold-away table under every chart on the page.
 *
 * The print-friendly summary has to carry the numbers, and a closed `details`
 * element prints as nothing but its summary line. CSS cannot open one, so the
 * page opens them itself. There is no dependency list on purpose: charts appear
 * as the view arrives, and opening a handful of elements again costs nothing.
 */
export function useOpenChartData(): void {
  useEffect(() => {
    const nodes = document.querySelectorAll<HTMLDetailsElement>('details.chart-data');
    for (const node of nodes) node.open = true;
  });
}
