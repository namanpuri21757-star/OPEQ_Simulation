import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { competitiveOutcome, cooperativeMax } from '@shared/engine/engine';
import { PRESETS, parseSettings } from '@shared/settings';
import { formatPrice, formatProfitK, formatQuantity } from '@shared/units';
import { settingsPreview } from '@shared/preview';
import { SettingsPreview } from './SettingsPreview';

/**
 * The preview is the one place a teacher is given numbers before anyone plays,
 * so these tests pin it to the vectors in SPEC section 3 rather than to whatever
 * the component happens to compute.
 */
describe('the settings preview', () => {
  it('shows the SPEC vectors for standard-75', () => {
    render(<SettingsPreview settings={PRESETS['standard-75']} />);

    // V6: all three at 38.3 gives $35.53 and $1,322.499M each, which rounds to
    // $1,322.50M on screen.
    const cooperate = screen.getByRole('row', { name: /^Cooperate/ });
    expect(cooperate).toHaveTextContent('38.3 / 38.3 / 38.3');
    expect(cooperate).toHaveTextContent('$35.53');
    expect(cooperate).toHaveTextContent('$1,322.50M');

    // V2: the competitive outcome is 57.5 each at $18.25 and $991.875M each.
    const compete = screen.getByRole('row', { name: /^Compete/ });
    expect(compete).toHaveTextContent('57.5 / 57.5 / 57.5');
    expect(compete).toHaveTextContent('$18.25');
    expect(compete).toHaveTextContent('$991.88M');

    // V3 and BR1: the best response to the other two at 38.3 asks for 76.7 and
    // is capped at capacity, which gives $24.52 and $1,764.00M for the cheater.
    const cheat = screen.getByRole('row', { name: /^One cheats/ });
    expect(cheat).toHaveTextContent('75.0 / 38.3 / 38.3');
    expect(cheat).toHaveTextContent('$24.52');
    expect(cheat).toHaveTextContent('$1,764.00M');
    expect(cheat).toHaveTextContent('$900.82M');
  });

  it('spells out what cheating gains and what it costs the others', () => {
    render(<SettingsPreview settings={PRESETS['standard-75']} />);

    // 1,764.00 - 1,322.50 = 441.50 for the cheater; 1,322.50 - 900.82 = 421.68
    // for each country that kept the deal.
    expect(screen.getByText('$441.50M more than keeping the deal')).toBeInTheDocument();
    expect(screen.getByText('$421.68M')).toBeInTheDocument();
  });

  it('agrees with the engine for a changed price line', () => {
    const settings = parseSettings({ a: 100, b: 0.5, cost: 2, capacity: 60 });
    render(<SettingsPreview settings={settings} />);

    const coop = cooperativeMax(settings, 1);
    const nash = competitiveOutcome(settings, 1);

    expect(screen.getByRole('row', { name: /^Cooperate/ })).toHaveTextContent(
      formatQuantity(coop.shareTenths),
    );
    expect(screen.getByRole('row', { name: /^Cooperate/ })).toHaveTextContent(
      formatPrice(coop.equalShares.priceCents),
    );
    expect(screen.getByRole('row', { name: /^Compete/ })).toHaveTextContent(
      formatProfitK(nash.eachProfitK),
    );
  });

  it('warns when the settings leave no dilemma to teach', () => {
    // With capacity so small that all three together cannot reach the
    // cooperative total, everyone is already at the cap and cooperating gains
    // nothing over competing.
    const settings = parseSettings({ capacity: 10, startingOutput: 10 });
    const preview = settingsPreview(settings);
    expect(preview.cooperative.jointProfitK).toBe(preview.competitive.jointProfitK);

    render(<SettingsPreview settings={settings} />);
    expect(screen.getByText(/the game has no dilemma in it/)).toBeInTheDocument();
  });

  it('includes the new producer when previewing its year', () => {
    const settings = PRESETS['standard-75'];
    render(<SettingsPreview settings={settings} year={settings.newProducer.year} />);

    // The best joint total takes the new producer's 15.0 barrels off the top,
    // so the cooperative share falls from 38.3 to 35.8 and world supply is
    // 3 x 35.8 + 15.0 = 122.4.
    const cooperate = screen.getByRole('row', { name: /^Cooperate/ });
    expect(cooperate).toHaveTextContent('35.8 / 35.8 / 35.8');
    expect(cooperate).toHaveTextContent('122.4');

    // The year is named, so a teacher cannot mistake it for Year 1.
    expect(screen.getByText(/^Year 9,/)).toBeInTheDocument();
  });
});
