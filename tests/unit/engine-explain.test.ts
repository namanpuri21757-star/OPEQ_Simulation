/**
 * The one plain sentence shown at a reveal.
 *
 * Two things are being tested: that it reads like English, and that it never
 * leaks. SPEC section 7 says a team under priceOnly must not learn the world
 * total, and SPEC section 4 says the new producer arrives unannounced by default,
 * so the sentence must not name either of them.
 */

import { describe, expect, it } from 'vitest';
import { DISCLOSURE_MODES, parseSettings } from '@shared/settings.js';
import type { PriceSnapshot } from '@shared/engine/engine.js';
import { explainChange, resolveWorldYear, snapshotOf } from '@shared/engine/engine.js';

function snapshot(partial: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    priceCents: 3553,
    totalTenths: 1149,
    newProducerTenths: 0,
    demandEventApplied: false,
    demandEventAnnounced: true,
    newProducerAnnounced: false,
    ...partial,
  };
}

describe('the direction of the change', () => {
  it('states the price when there is no year to compare with', () => {
    expect(explainChange(null, snapshot({ priceCents: 3553 }), 'full')).toBe('Price is $35.53.');
  });

  it('explains a fall with the change in world supply, exactly as SPEC 8.3 writes it', () => {
    const previous = snapshot({ priceCents: 3553, totalTenths: 1149 });
    const current = snapshot({ priceCents: 3103, totalTenths: 1299 });
    expect(explainChange(previous, current, 'full')).toBe(
      'Price fell $4.50 because world supply rose 15.0 million barrels.',
    );
  });

  it('explains a rise', () => {
    const previous = snapshot({ priceCents: 3103, totalTenths: 1299 });
    const current = snapshot({ priceCents: 3553, totalTenths: 1149 });
    expect(explainChange(previous, current, 'full')).toBe(
      'Price rose $4.50 because world supply fell 15.0 million barrels.',
    );
  });

  it('says so plainly when nothing changed', () => {
    const same = snapshot({ priceCents: 3553, totalTenths: 1149 });
    expect(explainChange(same, same, 'full')).toBe('Price did not change and is still $35.53.');
  });

  it('leaves out the reason when the price moved but supply did not', () => {
    // Only a demand event could do this, and here it was not announced.
    const previous = snapshot({ priceCents: 3553 });
    const current = snapshot({
      priceCents: 2553,
      demandEventApplied: true,
      demandEventAnnounced: false,
    });
    expect(explainChange(previous, current, 'full')).toBe('Price fell $10.00.');
  });

  it('is always one sentence', () => {
    const cases: Array<[PriceSnapshot | null, PriceSnapshot]> = [
      [null, snapshot({})],
      [snapshot({}), snapshot({ priceCents: 3000, totalTenths: 1500 })],
      [snapshot({}), snapshot({})],
      [
        snapshot({}),
        snapshot({
          priceCents: 2000,
          totalTenths: 1800,
          newProducerTenths: 150,
          newProducerAnnounced: true,
          demandEventApplied: true,
        }),
      ],
    ];
    for (const mode of DISCLOSURE_MODES) {
      for (const [previous, current] of cases) {
        const sentence = explainChange(previous, current, mode);
        expect(sentence.endsWith('.')).toBe(true);
        // A full stop inside would mean two sentences; "$35.53" has no space after its dot.
        expect(sentence.slice(0, -1)).not.toContain('. ');
        expect(sentence[0]).toBe(sentence[0]?.toUpperCase());
      }
    }
  });
});

describe('disclosure modes', () => {
  const previous = snapshot({ priceCents: 3553, totalTenths: 1149 });
  const current = snapshot({ priceCents: 3103, totalTenths: 1299 });

  it('names the change in supply under full disclosure', () => {
    expect(explainChange(previous, current, 'full')).toContain('world supply rose');
  });

  it('names it under totalOnly too, because the world total is public there', () => {
    expect(explainChange(previous, current, 'totalOnly')).toBe(
      explainChange(previous, current, 'full'),
    );
  });

  it('gives no reason at all under priceOnly, so the world total stays private', () => {
    const sentence = explainChange(previous, current, 'priceOnly');
    expect(sentence).toBe('Price fell $4.50.');
    expect(sentence).not.toContain('supply');
    expect(sentence).not.toContain('because');
  });
});

describe('events stay secret unless they were announced', () => {
  it('names an announced demand event', () => {
    const previous = snapshot({ priceCents: 3553, totalTenths: 1149 });
    const current = snapshot({
      priceCents: 2553,
      totalTenths: 1149,
      demandEventApplied: true,
      demandEventAnnounced: true,
    });
    expect(explainChange(previous, current, 'full')).toBe(
      'Price fell $10.00 because the news changed how much the world wants to buy.',
    );
  });

  it('never names an unannounced demand event', () => {
    const previous = snapshot({ priceCents: 3553, totalTenths: 1149 });
    const current = snapshot({
      priceCents: 2553,
      totalTenths: 1249,
      demandEventApplied: true,
      demandEventAnnounced: false,
    });
    const sentence = explainChange(previous, current, 'full');
    expect(sentence).toBe('Price fell $10.00 because world supply rose 10.0 million barrels.');
    expect(sentence).not.toContain('news');
    expect(sentence).not.toContain('demand');
  });

  it('mentions an announced demand event only in the year it arrives', () => {
    const during = snapshot({ priceCents: 2553, totalTenths: 1149, demandEventApplied: true });
    const after = snapshot({ priceCents: 2403, totalTenths: 1199, demandEventApplied: true });
    expect(explainChange(during, after, 'full')).toBe(
      'Price fell $1.50 because world supply rose 5.0 million barrels.',
    );
  });

  it('names an announced new producer', () => {
    const previous = snapshot({ priceCents: 3553, totalTenths: 1149, newProducerAnnounced: true });
    const current = snapshot({
      priceCents: 3103,
      totalTenths: 1299,
      newProducerTenths: 150,
      newProducerAnnounced: true,
    });
    expect(explainChange(previous, current, 'full')).toBe(
      'Price fell $4.50 because world supply rose 15.0 million barrels and another producer joined the market.',
    );
  });

  it('never names an unannounced new producer, in any disclosure mode', () => {
    const previous = snapshot({ priceCents: 3553, totalTenths: 1149 });
    const current = snapshot({ priceCents: 3103, totalTenths: 1299, newProducerTenths: 150 });
    for (const mode of DISCLOSURE_MODES) {
      const sentence = explainChange(previous, current, mode);
      expect(sentence).not.toContain('producer');
      expect(sentence).not.toContain('join');
    }
    // The change in supply is still fair game: SPEC section 4 shows the new
    // producer's barrels as "Other suppliers" under full disclosure.
    expect(explainChange(previous, current, 'full')).toBe(
      'Price fell $4.50 because world supply rose 15.0 million barrels.',
    );
  });
});

describe('snapshotOf', () => {
  it('takes the explanation inputs straight off a settled year', () => {
    const settings = parseSettings({
      newProducer: { enabled: true, year: 2, output: 15, announced: true },
      demandEvent: { enabled: true, year: 2, deltaA: -5 },
    });
    const year = (n: number) =>
      snapshotOf(
        resolveWorldYear({
          settings,
          sessionSeed: 'explain',
          worldId: 'W1',
          year: n,
          isPractice: false,
          targets: {
            A: { tenths: 383, auto: false },
            B: { tenths: 383, auto: false },
            C: { tenths: 383, auto: false },
          },
        }),
      );

    const one = year(1);
    const two = year(2);
    expect(one).toEqual({
      priceCents: 3553,
      totalTenths: 1149,
      newProducerTenths: 0,
      demandEventApplied: false,
      demandEventAnnounced: true,
      newProducerAnnounced: true,
    });
    expect(two.newProducerTenths).toBe(150);
    expect(two.demandEventApplied).toBe(true);
    // Both events land in the same year, so both are named.
    expect(explainChange(one, two, 'full')).toBe(
      'Price fell $9.50 because world supply rose 15.0 million barrels, the news changed how much the world wants to buy and another producer joined the market.',
    );
  });

  it('keeps both events out of the practice year', () => {
    const settings = parseSettings({
      newProducer: { enabled: true, year: 1, output: 15, announced: true },
      demandEvent: { enabled: true, year: 1, deltaA: -5 },
    });
    const practice = resolveWorldYear({
      settings,
      sessionSeed: 'explain',
      worldId: 'W1',
      year: 0,
      isPractice: true,
      targets: {
        A: { tenths: 383, auto: false },
        B: { tenths: 383, auto: false },
        C: { tenths: 383, auto: false },
      },
    });
    expect(practice.year).toBe(0);
    expect(practice.newProducerTenths).toBe(0);
    expect(practice.inputs.demandEventApplied).toBe(false);
    expect(practice.priceCents).toBe(3553);
  });
});
