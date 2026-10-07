import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { CountryLineView, RevealView, TeamView } from '@shared/views';
import { Badge, DataTable } from '../ui';
import { HistoryPanel } from './HistoryPanel';
import { NewsPanel } from './NewsPanel';

/**
 * The result of a year (SPEC 8.3).
 *
 * The price is the biggest thing on the screen, and right under it is one plain
 * sentence saying what changed and why. The sentence is written on the server, by
 * the same function for every world, and already leaves out anything this team is
 * not allowed to know.
 *
 * Which columns appear is likewise the server's decision: under totalOnly and
 * priceOnly the other countries' outputs simply are not in the view.
 */
function promise(line: CountryLineView): string {
  if (line.pledgeTenths === null) return 'no promise';
  return `${formatQuantity(line.pledgeTenths)} promised`;
}

function keptWords(line: CountryLineView): string {
  if (line.pledgeTenths === null || line.actualTenths === null) return '-';
  const difference = line.actualTenths - line.pledgeTenths;
  if (difference === 0) return 'kept its promise';
  if (difference > 0) return `produced ${formatQuantity(difference)} more than promised`;
  return `produced ${formatQuantity(-difference)} less than promised`;
}

function PriceHeadline({ reveal }: { reveal: RevealView }) {
  const change = reveal.priceChangeCents;
  return (
    <div className="reveal-price">
      <p className="reveal-price-label">{`${reveal.label} price`}</p>
      <p className="reveal-price-value">{formatPrice(reveal.priceCents)}</p>
      <p className="reveal-price-unit">per barrel</p>
      {change !== null && change !== 0 && (
        <p className="reveal-price-change">
          {`${change > 0 ? 'Up' : 'Down'} ${formatPrice(Math.abs(change))} from last year`}
        </p>
      )}
    </div>
  );
}

export function RevealScreen({ view }: { view: TeamView }) {
  const reveal = view.reveal;
  if (reveal === null) {
    return (
      <p className="waiting" role="status">
        Waiting for your teacher to show the results.
      </p>
    );
  }

  const full = view.settings.disclosure === 'full';
  const others = reveal.countries.filter((line) => line.letter !== view.letter);

  return (
    <>
      <section className="panel reveal" aria-labelledby="reveal-heading">
        <h2 id="reveal-heading">{`${reveal.label} results`}</h2>
        <PriceHeadline reveal={reveal} />
        <p className="reveal-sentence" role="status">
          {reveal.sentence}
        </p>

        <dl className="reveal-own">
          <dt>You produced</dt>
          <dd>
            {`${formatQuantity(reveal.ownActualTenths)} million barrels`}
            {reveal.ownAuto && <span className="tag"> filled in for you</span>}
            {reveal.ownActualTenths !== reveal.ownTargetTenths && (
              <span className="hint">{` (you asked for ${formatQuantity(reveal.ownTargetTenths)})`}</span>
            )}
          </dd>
          <dt>Your profit this year</dt>
          <dd>{formatProfitK(reveal.ownProfitK)}</dd>
          <dt>Your total so far</dt>
          <dd>
            {reveal.isPractice
              ? 'the practice year does not count'
              : formatProfitK(reveal.cumulativeProfitK)}
          </dd>
          {reveal.totalTenths !== null && (
            <>
              <dt>The whole world produced</dt>
              <dd>{`${formatQuantity(reveal.totalTenths)} million barrels`}</dd>
            </>
          )}
          {reveal.newProducerTenths !== null && reveal.newProducerTenths > 0 && (
            <>
              <dt>Other suppliers</dt>
              <dd>{`${formatQuantity(reveal.newProducerTenths)} million barrels`}</dd>
            </>
          )}
        </dl>
      </section>

      <section className="panel" aria-labelledby="world-heading">
        <h2 id="world-heading">Your world this year</h2>
        {full ? (
          <DataTable
            caption="What each country promised and what it produced"
            columns={['Country', 'Promised', 'Produced', 'Promise kept?']}
            rows={reveal.countries.map((line) => [
              `${line.countryName} (${line.letter})${line.letter === view.letter ? ' - you' : ''}`,
              line.pledgeTenths === null ? 'no promise' : formatQuantity(line.pledgeTenths),
              line.actualTenths === null
                ? 'not shown'
                : `${formatQuantity(line.actualTenths)}${line.auto ? ' (auto)' : ''}`,
              keptWords(line),
            ])}
          />
        ) : (
          <>
            <p className="hint">
              Your teacher has set this game so that you only see your own output. The price tells
              you what everyone did together.
            </p>
            <ul className="promise-list">
              {others.map((line) => (
                <li key={line.letter}>
                  <Badge letter={line.letter} size="small" />
                  <span>{`${line.countryName}: ${promise(line)}`}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <NewsPanel view={view} />
      <HistoryPanel view={view} />

      <p className="waiting" role="status">
        Waiting for the next year.
      </p>
    </>
  );
}
