import type { DebriefData } from '@shared/debrief';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import { DataTable } from '../ui';

/**
 * Game theory, in the class's own numbers (SPEC 8.4, learning goal LG4).
 *
 * This is the one screen students were never allowed to see during play, so it
 * explains rather than just tabulates: the two benchmarks, why the better one is
 * unstable, and where each world actually landed between them.
 */
export interface GameTheoryProps {
  debrief: DebriefData;
}

export function GameTheory({ debrief }: GameTheoryProps) {
  const t = debrief.theory;
  const capped = t.bestResponseTenths !== t.bestResponseRawTenths;

  return (
    <section className="debrief-screen" aria-labelledby="theory-heading">
      <h2 id="theory-heading">{debrief.titles.gameTheory}</h2>

      <h3>The two numbers the game is between</h3>
      <DataTable
        caption="The benchmarks for your settings"
        columns={[
          'Outcome',
          'Each country',
          'Total supply',
          'Price',
          'Each country earns',
          'All three earn',
        ]}
        rows={[
          [
            'Everyone cooperates',
            formatQuantity(t.shareTenths),
            formatQuantity(t.shareTenths * 3),
            formatPrice(t.cooperativePriceCents),
            formatProfitK(t.cooperativeEachProfitK),
            formatProfitK(t.cooperativeEachProfitK * 3),
          ],
          [
            'Everyone competes',
            formatQuantity(t.competitiveEachTenths),
            formatQuantity(t.competitiveTotalTenths),
            formatPrice(t.competitivePriceCents),
            formatProfitK(t.competitiveEachProfitK),
            formatProfitK(t.competitiveEachProfitK * 3),
          ],
        ]}
      />

      <h3>Why cooperating does not hold</h3>
      <p>
        {`Suppose the other two keep their word and produce ${formatQuantity(t.shareTenths)} million barrels each, which is ${formatQuantity(t.bestResponseOthersTenths)} between them. Your best answer is not to match them. It is this:`}
      </p>
      <p className="debrief-formula">your best output = (a - cost - b x everyone else) / (2 x b)</p>
      <p>
        {capped
          ? `For your settings that comes out at ${formatQuantity(t.bestResponseRawTenths)}, which is more than your capacity, so the best you can actually do is ${formatQuantity(t.bestResponseTenths)}.`
          : `For your settings that is ${formatQuantity(t.bestResponseTenths)} million barrels.`}
      </p>
      <DataTable
        caption="One country breaking an agreement the other two keep"
        columns={['Country', 'Output', 'Profit', 'Change from cooperating']}
        rows={[
          [
            'The one that produced more',
            formatQuantity(t.bestResponseTenths),
            formatProfitK(t.bestResponseProfitK),
            `+${formatProfitK(t.gainFromCheatingK)}`,
          ],
          [
            'Each one that kept its word',
            formatQuantity(t.shareTenths),
            formatProfitK(t.cooperativeEachProfitK - t.lossPerCooperatorK),
            `-${formatProfitK(t.lossPerCooperatorK)}`,
          ],
        ]}
      />
      <p>
        Every country can see that same arithmetic, so every country is tempted at the same moment.
        That is the whole dilemma: the move that is best for you on your own makes all three of you
        worse off together.
      </p>

      <h3>Where your worlds actually landed</h3>
      <DataTable
        caption="Average supply over the scored years"
        columns={['World', 'Average supply from the three countries', 'Share of the best possible']}
        rows={t.landings.map((landing) => [
          landing.label,
          formatQuantity(landing.averageTotalTenths),
          `${String(landing.percentOfMax)}%`,
        ])}
      />
      <ul className="debrief-landings">
        {t.landings.map((landing) => (
          <li key={landing.worldNumber}>{landing.note}</li>
        ))}
      </ul>
      <p className="debrief-note">
        {`For reference: a perfect agreement is ${formatQuantity(t.shareTenths * 3)} million barrels between the three, and full competition is ${formatQuantity(t.competitiveTotalTenths)}.`}
      </p>
    </section>
  );
}
