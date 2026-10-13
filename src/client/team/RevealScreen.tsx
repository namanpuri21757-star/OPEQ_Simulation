import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import type { RevealView, TeamView } from '@shared/views';
import type { SendCommand } from '../net';
import { DataTable, StartsIn, type Say } from '../ui';
import { HistoryPanel } from './HistoryPanel';
import { MessagesPanel } from './MessagesPanel';

/**
 * The result of a year (SPEC 8.3).
 *
 * The price is the headline, and right under it is one plain sentence saying
 * what changed and why. The sentence is written on the server, by the same
 * function for every world, and already leaves out anything this team is not
 * allowed to know.
 *
 * Which columns appear is likewise the server's decision: under totalOnly and
 * priceOnly the other countries' outputs simply are not in the view. There are
 * no promise columns any more - a promise was a plain message, and the message
 * list is where to read it.
 *
 * The messages box is here as well as on the year screen, because a messaging
 * window is opened between years: this screen is what a group is sitting in
 * front of when the teacher turns the switch on.
 */
export interface RevealScreenProps {
  view: TeamView;
  send: SendCommand;
  onSaid?: Say | undefined;
  serverNow?: (() => number) | undefined;
}

function PriceHeadline({ reveal }: { reveal: RevealView }) {
  const change = reveal.priceChangeCents;
  return (
    <>
      <p className="obs-period">{reveal.label}</p>
      <p>
        <strong className="obs-value">{formatPrice(reveal.priceCents)}</strong>
        <span className="obs-units">$ per barrel</span>
      </p>
      {change !== null && change !== 0 && (
        <p className={`obs-change ${change > 0 ? 'obs-up' : 'obs-down'}`}>
          <span aria-hidden="true">{change > 0 ? '▲' : '▼'}</span>{' '}
          {`${formatPrice(Math.abs(change))} from last year`}
        </p>
      )}
    </>
  );
}

export function RevealScreen({ view, send, onSaid, serverNow }: RevealScreenProps) {
  const reveal = view.reveal;
  if (reveal === null) {
    return (
      <section className="box">
        <p className="note" role="status">
          Waiting for your teacher to show the results.
        </p>
      </section>
    );
  }

  const full = view.settings.disclosure === 'full';

  return (
    <div className="cols cols-2">
      <div className="stack">
        <section className="box" aria-labelledby="reveal-heading">
          <h2 className="visually-hidden" id="reveal-heading">
            {`${reveal.label} results`}
          </h2>
          <PriceHeadline reveal={reveal} />
          <StartsIn at={view.advanceAt} what={`Year ${String(view.year + 1)}`} serverNow={serverNow} />
          <p className="lede" role="status" style={{ marginTop: 'var(--s4)' }}>
            {reveal.sentence}
          </p>

          <div className="facts">
            <p>
              <span className="fact-key">You produced</span>
              <span className="fact-value">{formatQuantity(reveal.ownActualTenths)}</span>{' '}
              <span className="obs-units">million barrels</span>
              {reveal.ownAuto && <span className="auto-mark">auto</span>}
            </p>
            <p>
              <span className="fact-key">Your profit this year</span>
              <span className="fact-value">{formatProfitK(reveal.ownProfitK)}</span>
            </p>
            <p>
              <span className="fact-key">Your total so far</span>
              <span className="fact-value">
                {reveal.isPractice ? 'not counted' : formatProfitK(reveal.cumulativeProfitK)}
              </span>
            </p>
            {reveal.totalTenths !== null && (
              <p>
                <span className="fact-key">World production</span>
                <span className="fact-value">{formatQuantity(reveal.totalTenths)}</span>{' '}
                <span className="obs-units">million barrels</span>
              </p>
            )}
          </div>
        </section>

        <section className="box" aria-labelledby="world-heading">
          <div className="box-head">
            <h2 id="world-heading">{`Your world in ${reveal.label}`}</h2>
          </div>
          {full ? (
            <DataTable
              caption="What each country produced"
              columns={['Country', 'Produced (million barrels)', 'Profit']}
              rows={reveal.countries.map((line) => [
                `${line.countryName}${line.letter === view.letter ? ' (you)' : ''}`,
                line.actualTenths === null ? 'not shown' : formatQuantity(line.actualTenths),
                line.profitK === null ? 'only you see this' : formatProfitK(line.profitK),
              ])}
              hideCaption
            />
          ) : (
            <p className="note">
              Your teacher has set this game so that you only see your own output. The price tells
              you what everyone did together.
            </p>
          )}
          {reveal.newProducerTenths !== null && reveal.newProducerTenths > 0 && (
            <p className="note" style={{ marginTop: 'var(--s4)' }}>
              {`Other suppliers: ${formatQuantity(reveal.newProducerTenths)} million barrels.`}
            </p>
          )}
        </section>

        <HistoryPanel view={view} />

        <section className="box">
          <p className="note" role="status">
            Waiting for the next year.
          </p>
        </section>
      </div>

      <div className="stack">
        <MessagesPanel view={view} send={send} onSaid={onSaid} serverNow={serverNow} />
      </div>
    </div>
  );
}
