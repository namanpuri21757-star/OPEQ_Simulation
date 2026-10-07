import { useId, useState } from 'react';
import { formatPrice, formatProfitK, formatQuantity, parseQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';
import { LineChart } from '../ui';
import { clientUnits, demandCurve, whatIf } from './economics';

/**
 * The Analyst's tool (SPEC 8.3): try a number, guess what the others will add
 * up to, and see the price and your profit before you commit.
 *
 * Everything here is worked out on this computer with the shared engine, purely
 * so the group can think. Nothing is sent, and no result ever comes from here
 * (CLAUDE.md rule 1).
 */
export function WhatIfPanel({ view }: { view: TeamView }) {
  const settings = view.settings;
  const max = settings.capacityTenths;
  const id = useId();

  // Before the first year there is no history to start from, so the calculator
  // opens on the example from the briefing: everyone at the starting output.
  const previous = view.history[view.history.length - 1];
  const start = clientUnits(settings).startingOutputTenths;
  const [mine, setMine] = useState(() =>
    formatQuantity(view.decision?.tenths ?? previous?.ownTargetTenths ?? start),
  );
  const [others, setOthers] = useState(() =>
    formatQuantity((previous?.ownTargetTenths ?? start) * 2),
  );

  const mineParsed = parseQuantity(mine, max);
  const othersParsed = parseQuantity(others, max * 2);
  const ready = mineParsed.ok && othersParsed.ok;
  const result = ready ? whatIf(mineParsed.tenths, othersParsed.tenths, settings) : null;

  const curve = demandCurve(settings);
  const series = [
    { name: 'Price for the whole world', points: curve, marker: 'circle' as const },
    ...(result
      ? [
          {
            name: 'Your guess',
            points: [{ x: result.totalTenths, y: result.priceCents }],
            marker: 'square' as const,
          },
        ]
      : []),
  ];

  return (
    <section className="panel whatif" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>What-if calculator</h2>
      <p className="hint">
        This is only a sketch pad. Nothing here is sent to your teacher or to the other countries.
      </p>

      <div className="whatif-fields">
        <p className="field">
          <label htmlFor={`${id}-mine`}>If I produce (million barrels)</label>
          <input
            id={`${id}-mine`}
            type="text"
            inputMode="decimal"
            value={mine}
            onChange={(event) => setMine(event.target.value)}
          />
          {!mineParsed.ok && <span className="problem">{mineParsed.message}</span>}
        </p>
        <p className="field">
          <label htmlFor={`${id}-others`}>
            and the other two produce, together (million barrels)
          </label>
          <input
            id={`${id}-others`}
            type="text"
            inputMode="decimal"
            value={others}
            onChange={(event) => setOthers(event.target.value)}
          />
          {!othersParsed.ok && <span className="problem">{othersParsed.message}</span>}
        </p>
      </div>

      {result !== null ? (
        <dl className="whatif-result">
          <dt>World production</dt>
          <dd>{`${formatQuantity(result.totalTenths)} million barrels`}</dd>
          <dt>Price</dt>
          <dd>{`${formatPrice(result.priceCents)} per barrel`}</dd>
          <dt>Your profit</dt>
          <dd>{formatProfitK(result.profitK)}</dd>
        </dl>
      ) : (
        <p className="hint">Type two numbers to see the price and your profit.</p>
      )}

      <LineChart
        title="How the price falls as the world produces more"
        series={series}
        xLabel="World production (million barrels)"
        leftLabel="$ per barrel"
        formatX={(x) => formatQuantity(x)}
        formatLeft={(y) => formatPrice(y)}
        height={220}
      />
    </section>
  );
}
