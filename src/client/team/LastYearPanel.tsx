import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { TeamView } from '@shared/views';

/**
 * Last year's price as one headline observation, in the style a data page uses:
 * the number in bold with the period it belongs to, the units spelled out, and
 * the change from the year before underneath with an arrow.
 *
 * It answers the only question a group has while deciding - "what happened last
 * time?" - and it answers it with the one number everything else follows from.
 * The arrow comes before the colour, so the direction reads in black and white
 * (SPEC section 9).
 */
export function LastYearPanel({ view }: { view: TeamView }) {
  const rows = view.history;
  const last = rows[rows.length - 1];
  if (!last) return null;
  const before = rows[rows.length - 2];
  const change = before ? last.priceCents - before.priceCents : null;

  return (
    <section className="box" aria-labelledby="last-year-heading">
      <h2 className="visually-hidden" id="last-year-heading">
        Last year
      </h2>

      <p className="obs-period">{last.isPractice ? 'Practice year' : `Year ${String(last.year)}`}</p>
      <p>
        <strong className="obs-value">{formatPrice(last.priceCents)}</strong>
        <span className="obs-units">$ per barrel</span>
      </p>

      {change !== null && before && (
        <p className={`obs-change ${change >= 0 ? 'obs-up' : 'obs-down'}`}>
          <span aria-hidden="true">{change >= 0 ? '▲' : '▼'}</span>{' '}
          {`${formatPrice(Math.abs(change))} from ${before.isPractice ? 'the practice year' : `Year ${String(before.year)}`}`}
        </p>
      )}

      <div className="facts">
        {last.totalTenths !== null && (
          <p>
            <span className="fact-key">World production</span>
            <span className="fact-value">{formatQuantity(last.totalTenths)}</span>{' '}
            <span className="obs-units">million barrels</span>
          </p>
        )}
        <p>
          <span className="fact-key">Your profit</span>
          <span className="fact-value">{formatProfitK(last.ownProfitK)}</span>
        </p>
      </div>
    </section>
  );
}
