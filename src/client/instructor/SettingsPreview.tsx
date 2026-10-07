import { settingsPreview, type PreviewRow } from '@shared/preview';
import type { Settings } from '@shared/settings';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import { DataTable } from '../ui';

/**
 * What these settings will feel like, before anyone plays them (SPEC 8.4).
 *
 * It answers the two questions a teacher has while changing numbers: is there
 * still a real gap between cooperating and competing, and is cheating still
 * tempting? If the gap collapses, the lesson has nothing to teach, and that is
 * easier to see here than halfway through Year 4.
 *
 * Every number comes from the shared engine, so this panel and the world a class
 * actually plays cannot disagree.
 */
export interface SettingsPreviewProps {
  settings: Settings;
  /** Which year to preview. Year 1 is before any scheduled event. */
  year?: number;
}

function row(name: string, data: PreviewRow): readonly string[] {
  return [
    name,
    data.eachTenths.map((tenths) => formatQuantity(tenths)).join(' / '),
    formatQuantity(data.totalTenths),
    formatPrice(data.priceCents),
    data.profitK.map((profit) => formatProfitK(profit)).join(' / '),
    formatProfitK(data.jointProfitK),
  ];
}

export function SettingsPreview({ settings, year = 1 }: SettingsPreviewProps) {
  const preview = settingsPreview(settings, year);

  return (
    <section className="panel preview" aria-labelledby="preview-heading">
      <h3 id="preview-heading">What these settings play like</h3>
      <p className="hint">
        {`Year ${String(preview.year)}, with the countries in the order Ardonia, Borvia, Cendra. These are your numbers only - students never see them during play.`}
      </p>

      <DataTable
        caption="Outcomes for these settings"
        hideCaption
        columns={[
          'If they all...',
          'Output each',
          'World supply',
          'Price',
          'Profit each',
          'All three',
        ]}
        rows={[
          row('Cooperate', preview.cooperative),
          row('Compete', preview.competitive),
          row('One cheats', preview.cheating),
        ]}
      />

      <dl className="preview-points">
        <div>
          <dt>Cheating pays the cheater</dt>
          <dd>{`${formatProfitK(preview.cheatingGainK)} more than keeping the deal`}</dd>
        </div>
        <div>
          <dt>It costs each country that kept the deal</dt>
          <dd>{formatProfitK(preview.keeperLossK)}</dd>
        </div>
        <div>
          <dt>Cooperating beats competing by</dt>
          <dd>
            {`${formatProfitK(preview.cooperative.jointProfitK - preview.competitive.jointProfitK)} for the three together`}
          </dd>
        </div>
      </dl>

      {preview.cooperative.jointProfitK <= preview.competitive.jointProfitK && (
        <p className="problem">
          With these settings, cooperating is no better than competing, so the game has no dilemma
          in it. Try a higher price (a) or a steeper slope (b).
        </p>
      )}
    </section>
  );
}
