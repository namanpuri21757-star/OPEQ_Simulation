/**
 * The debrief numbers (SPEC 8.4).
 *
 * These are the numbers a teacher will say out loud in front of a class, so
 * every one of them is checked against an arithmetic a reader can follow, and
 * the awkward cases - a world that never cooperated, a missing pledge, a game
 * ended early - each get their own test.
 */

import { describe, expect, it } from 'vitest';
import { COUNTRY_LETTERS } from '../../src/shared/constants.js';
import { cooperativeMax } from '../../src/shared/engine/engine.js';
import { debriefFor, percentOf, pledgeKept, THEORY_YEAR } from '../../src/shared/debrief.js';
import { DEFAULT_SETTINGS, PRESETS, parseSettings } from '../../src/shared/settings.js';
import { formatProfitK } from '../../src/shared/units.js';
import {
  addChat,
  addPledge,
  closedAt,
  makeSession,
  setHuddle,
  setPrediction,
  setReflection,
  type Triple,
} from '../support/session.js';

/** An equal cooperative share with the standard settings: 38.3 million. */
const SHARE = cooperativeMax(DEFAULT_SETTINGS, 1).shareTenths;
const CAPACITY = 750;

const cooperating: Triple = [SHARE, SHARE, SHARE];
const competing: Triple = [575, 575, 575];
const aCheats: Triple = [CAPACITY, SHARE, SHARE];

describe('percentOf', () => {
  it('rounds to a whole percent', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(2, 3)).toBe(67);
  });

  it('is 0 when there is nothing to divide by, rather than infinite', () => {
    expect(percentOf(5, 0)).toBe(0);
  });
});

describe('a world that always cooperates', () => {
  const state = makeSession({ plays: [[cooperating, cooperating, cooperating]] });
  const debrief = debriefFor(state);
  const world = debrief.worlds[0];

  it('keeps all of the cooperative maximum', () => {
    expect(world?.percentOfMax).toBe(100);
    expect(world?.years.map((year) => year.percentOfMax)).toEqual([100, 100, 100]);
  });

  it('counts every year as cooperative and finds no break', () => {
    expect(world?.years.every((year) => year.cooperative)).toBe(true);
    expect(world?.break.year).toBeNull();
    expect(world?.break.note).toContain('never broke its agreement');
    expect(world?.break.longestRun).toBe(3);
  });

  it('titles itself with the finding', () => {
    expect(world?.title).toBe(
      'World 1 kept 100% of the cooperative maximum and never broke its agreement.',
    );
  });

  it('adds each country up to its cumulative profit', () => {
    const years = world?.years ?? [];
    for (const letter of COUNTRY_LETTERS) {
      const perYear = years.map(
        (year) => year.countries.find((country) => country.letter === letter)?.profitK ?? 0,
      );
      const last = years[years.length - 1]?.countries.find((country) => country.letter === letter);
      expect(last?.cumulativeProfitK).toBe(perYear.reduce((sum, value) => sum + value, 0));
    }
  });
});

describe('a world that never cooperates', () => {
  const state = makeSession({ plays: [[competing, competing, competing]] });
  const world = debriefFor(state).worlds[0];

  it('keeps well under the cooperative maximum', () => {
    expect(world?.percentOfMax).toBeLessThan(80);
    expect(world?.percentOfMax).toBeGreaterThan(0);
  });

  it('has no break year, because there was never an agreement', () => {
    expect(world?.break.year).toBeNull();
    expect(world?.break.note).toContain('no agreement to break');
    expect(world?.title).toContain('never settled on an agreement');
  });
});

describe('the year cooperation broke', () => {
  it('is the first bad year after two good ones', () => {
    const state = makeSession({
      plays: [[cooperating, cooperating, cooperating, aCheats, cooperating]],
    });
    const world = debriefFor(state).worlds[0];
    expect(world?.break.year).toBe(4);
    expect(world?.break.letters).toEqual(['A']);
    expect(world?.break.note).toContain('Year 4');
    expect(world?.title).toContain('held together until Year 4');
  });

  it('ignores a bad year that follows only one good one', () => {
    const state = makeSession({ plays: [[cooperating, aCheats, cooperating, cooperating]] });
    const world = debriefFor(state).worlds[0];
    expect(world?.break.year).toBeNull();
  });

  it('names every country that went over the line', () => {
    const state = makeSession({
      plays: [[cooperating, cooperating, [CAPACITY, CAPACITY, SHARE]]],
    });
    const world = debriefFor(state).worlds[0];
    expect(world?.break.year).toBe(3);
    expect(world?.break.letters).toEqual(['A', 'B']);
  });

  it('allows ten percent of slack before calling it a break', () => {
    // 10% above 38.3 is 42.1; 42.2 is over the line.
    const inside: Triple = [421, SHARE, SHARE];
    const outside: Triple = [422, SHARE, SHARE];
    const keeps = debriefFor(makeSession({ plays: [[cooperating, cooperating, inside]] }));
    const breaks = debriefFor(makeSession({ plays: [[cooperating, cooperating, outside]] }));
    expect(keeps.worlds[0]?.break.year).toBeNull();
    expect(breaks.worlds[0]?.break.year).toBe(3);
  });
});

describe('pledges', () => {
  it('counts a pledge as kept within half a million barrels', () => {
    expect(pledgeKept(383, 388)).toBe(true);
    expect(pledgeKept(383, 389)).toBe(false);
    expect(pledgeKept(383, 378)).toBe(true);
    expect(pledgeKept(383, 377)).toBe(false);
  });

  it('marks each year kept or broken, and leaves a year with no pledge blank', () => {
    const state = makeSession({ plays: [[cooperating, aCheats]] });
    addPledge(state, 1, 'A', 1, SHARE);
    addPledge(state, 1, 'A', 2, SHARE);
    const world = debriefFor(state).worlds[0];

    const yearOne = world?.years[0]?.countries.find((country) => country.letter === 'A');
    const yearTwo = world?.years[1]?.countries.find((country) => country.letter === 'A');
    const noPledge = world?.years[0]?.countries.find((country) => country.letter === 'B');

    expect(yearOne?.pledgeKept).toBe(true);
    expect(yearTwo?.pledgeTenths).toBe(SHARE);
    expect(yearTwo?.pledgeKept).toBe(false);
    expect(noPledge?.pledgeTenths).toBeNull();
    expect(noPledge?.pledgeKept).toBeNull();

    const country = world?.countries.find((row) => row.letter === 'A');
    expect(country?.pledgesMade).toBe(2);
    expect(country?.pledgesKept).toBe(1);
  });

  it('carries a pledge forward until it is replaced', () => {
    const state = makeSession({ plays: [[cooperating, cooperating]] });
    addPledge(state, 1, 'C', 1, SHARE);
    const world = debriefFor(state).worlds[0];
    const later = world?.years[1]?.countries.find((country) => country.letter === 'C');
    expect(later?.pledgeTenths).toBe(SHARE);
    expect(later?.pledgeKept).toBe(true);
  });
});

describe('the message timeline', () => {
  it('marks each pledge against the year that followed it', () => {
    const state = makeSession({ plays: [[cooperating, aCheats]] });
    addChat(state, 1, 'B', 1, 'Shall we all stay at 38.3?');
    addPledge(state, 1, 'A', 2, SHARE);
    const messages = debriefFor(state).worlds[0]?.messages ?? [];

    const chat = messages.find((message) => message.kind === 'chat');
    expect(chat?.year).toBe(1);
    expect(chat?.kept).toBeNull();

    const pledge = messages.find((message) => message.kind === 'pledge');
    expect(pledge?.year).toBe(2);
    expect(pledge?.kept).toBe(false);
    expect(pledge?.actualTenths).toBe(CAPACITY);
  });

  it('leaves a pledge made after the last year unmarked rather than broken', () => {
    const state = makeSession({ plays: [[cooperating]] });
    state.messages.push({
      messageId: 'late',
      worldId: 'world-1',
      teamId: 'world-1-A',
      letter: 'A',
      kind: 'pledge',
      text: 'We will produce 38.3 million barrels.',
      tenths: SHARE,
      at: closedAt(1) + 5000,
    });
    const pledge = debriefFor(state).worlds[0]?.messages.find((m) => m.messageId === 'late');
    expect(pledge?.year).toBeNull();
    expect(pledge?.kept).toBeNull();
  });

  it('shows an announcement that went to every world in each world', () => {
    const state = makeSession({ plays: [[cooperating], [cooperating]] });
    state.messages.push({
      messageId: 'note',
      worldId: null,
      teamId: null,
      letter: null,
      kind: 'announcement',
      text: 'Five minutes left.',
      at: closedAt(1) - 500,
    });
    const debrief = debriefFor(state);
    for (const world of debrief.worlds) {
      const found = world.messages.find((message) => message.messageId === 'note');
      expect(found?.countryName).toBeNull();
    }
  });
});

describe('predictions', () => {
  it('measures how far out each guess was', () => {
    const state = makeSession({ plays: [[cooperating, aCheats]] });
    // A guessed the other two would stay at the share, and they did.
    setPrediction(state, 1, 'A', 1, { othersTenths: [SHARE, SHARE], trust: 4, at: closedAt(1) });
    // In Year 2 A guessed low by 10.0 million barrels in total.
    setPrediction(state, 1, 'A', 2, { othersTenths: [283, 383], trust: 2, at: closedAt(2) });
    const country = debriefFor(state).worlds[0]?.countries.find((row) => row.letter === 'A');

    expect(country?.predictions).toHaveLength(2);
    expect(country?.predictions[0]).toMatchObject({
      year: 1,
      predictedTenths: SHARE * 2,
      actualTenths: SHARE * 2,
      errorTenths: 0,
    });
    expect(country?.predictions[1]?.errorTenths).toBe(100);
    expect(country?.meanPredictionErrorTenths).toBe(50);
    expect(country?.averageTrustTenths).toBe(30);
  });

  it('reports no error at all when a group never guessed', () => {
    const state = makeSession({ plays: [[cooperating]] });
    const country = debriefFor(state).worlds[0]?.countries.find((row) => row.letter === 'A');
    expect(country?.predictions).toEqual([]);
    expect(country?.meanPredictionErrorTenths).toBeNull();
    expect(country?.averageTrustTenths).toBeNull();
  });
});

describe('huddles', () => {
  it('says whose suggestion became the decision', () => {
    const state = makeSession({ plays: [[cooperating, cooperating]] });
    setHuddle(state, 1, 'A', 1, {
      suggestions: [
        { name: 'Ada', tenths: SHARE },
        { name: 'Ben', tenths: 500 },
      ],
      reason: 'Keep the price up.',
      at: closedAt(1),
    });
    setHuddle(state, 1, 'A', 2, {
      suggestions: [
        { name: 'Ada', tenths: 600 },
        { name: 'Ben', tenths: SHARE },
      ],
      reason: 'Same again.',
      at: closedAt(2),
    });

    const country = debriefFor(state).worlds[0]?.countries.find((row) => row.letter === 'A');
    expect(country?.huddles[0]?.decisionTenths).toBe(SHARE);
    expect(country?.huddles[0]?.suggestions.map((s) => s.matched)).toEqual([true, false]);
    expect(country?.memberMatches).toEqual([
      { name: 'Ada', suggestions: 2, matched: 1 },
      { name: 'Ben', suggestions: 2, matched: 1 },
      { name: 'Cleo', suggestions: 0, matched: 0 },
    ]);
  });
});

describe('what a debrief carries about the whole session', () => {
  it('ranks countries and worlds, and names the top one in the title', () => {
    // Ardonia produces a little more than its share in World 1: still inside
    // the slack, so the world looks cooperative, but it earns the most.
    const slightlyMore: Triple = [390, SHARE, SHARE];
    const state = makeSession({
      plays: [
        [slightlyMore, slightlyMore],
        [competing, competing],
      ],
    });
    const debrief = debriefFor(state);

    expect(debrief.leaderboard.worlds[0]?.worldNumber).toBe(1);
    expect(debrief.leaderboard.countries).toHaveLength(6);
    const profits = debrief.leaderboard.countries.map((row) => row.cumulativeProfitK);
    expect([...profits].sort((x, y) => y - x)).toEqual(profits);
    expect(debrief.titles.leaderboard).toBe(
      `World 1 - Ardonia (A) earned the most, ${formatProfitK(debrief.leaderboard.countries[0]?.cumulativeProfitK ?? 0)}.`,
    );
    expect(debrief.titles.comparison).toContain('World 1 came closest');
  });

  it('marks the moments that matter on the chart', () => {
    const settings = parseSettings({
      years: 10,
      schedule: [
        { afterYear: 3, kind: 'chat', seconds: 240 },
        { afterYear: 7, kind: 'summit', seconds: 300 },
      ],
      newProducer: { enabled: true, year: 9 },
    });
    const years: Triple[] = Array.from({ length: 10 }, () => cooperating);
    const state = makeSession({ settings, plays: [years] });
    state.activitiesDone = ['3:chat', '7:summit'];
    state.finalYearAnnounced = true;

    const markers = debriefFor(state).worlds[0]?.markers ?? [];
    expect(markers.map((marker) => marker.kind)).toEqual([
      'chat',
      'summit',
      'newProducer',
      'finalYear',
    ]);
    expect(markers[0]?.label).toBe('Chat after Year 3');
    expect(markers[2]?.label).toContain('15.0 million barrels');
    expect(markers[3]?.year).toBe(10);
  });

  it('keeps the practice year out of every total', () => {
    const state = makeSession({
      plays: [[cooperating]],
      practice: [[CAPACITY, CAPACITY, CAPACITY]],
    });
    const world = debriefFor(state).worlds[0];
    expect(world?.years).toHaveLength(1);
    expect(world?.years[0]?.year).toBe(1);
    expect(world?.percentOfMax).toBe(100);
  });

  it('marks a decision the server filled in', () => {
    const state = makeSession({ plays: [[cooperating]], autos: ['1:B'] });
    const year = debriefFor(state).worlds[0]?.years[0];
    expect(year?.countries.find((country) => country.letter === 'B')?.auto).toBe(true);
    expect(year?.countries.find((country) => country.letter === 'A')?.auto).toBe(false);
  });

  it('works for a game that was ended early', () => {
    // Twelve years were planned and three were played.
    const state = makeSession({ plays: [[cooperating, cooperating, cooperating]] });
    const debrief = debriefFor(state);
    expect(state.settings.years).toBe(12);
    expect(debrief.years).toEqual([1, 2, 3]);
    expect(debrief.worlds[0]?.years).toHaveLength(3);
    expect(debrief.empty).toBe(false);
  });

  it('says plainly that there is nothing to show when no year was scored', () => {
    const state = makeSession({ plays: [[]] });
    const debrief = debriefFor(state);
    expect(debrief.empty).toBe(true);
    expect(debrief.years).toEqual([]);
    expect(debrief.titles.comparison).toBe('No years have been scored yet.');
    expect(debrief.worlds[0]?.title).toBe('World 1 played no scored years.');
    expect(debrief.worlds[0]?.break.note).toBe('No years were scored.');
  });

  it('keeps the reflections each group wrote', () => {
    const state = makeSession({ plays: [[cooperating]] });
    setReflection(state, 1, 'A', ['Years 1 to 3.', 'Nobody broke a promise.', 'Talk sooner.']);
    const country = debriefFor(state).worlds[0]?.countries.find((row) => row.letter === 'A');
    expect(country?.reflection?.[0]).toBe('Years 1 to 3.');
    expect(
      debriefFor(state).worlds[0]?.countries.find((row) => row.letter === 'B')?.reflection,
    ).toBeNull();
  });
});

describe('the game theory screen', () => {
  const state = makeSession({ plays: [[cooperating, cooperating]] });
  const theory = debriefFor(state).theory;

  it('uses the first year, before any new producer', () => {
    expect(theory.year).toBe(THEORY_YEAR);
    expect(theory.shareTenths).toBe(383);
    expect(theory.cooperativeTotalTenths).toBe(1150);
    expect(theory.cooperativeMaxK).toBe(3967500);
  });

  it('gives the competitive outcome', () => {
    expect(theory.competitiveEachTenths).toBe(575);
    expect(theory.competitivePriceCents).toBe(1825);
    expect(theory.competitiveEachProfitK).toBe(991875);
  });

  it('shows the best response to everyone cooperating, capped by capacity', () => {
    expect(theory.bestResponseOthersTenths).toBe(766);
    expect(theory.bestResponseRawTenths).toBe(767);
    expect(theory.bestResponseTenths).toBe(750);
    expect(theory.bestResponseProfitK).toBe(1764000);
    expect(theory.gainFromCheatingK).toBe(1764000 - theory.cooperativeEachProfitK);
    expect(theory.lossPerCooperatorK).toBe(theory.cooperativeEachProfitK - 900816);
  });

  it('says where each world landed', () => {
    expect(theory.landings[0]).toMatchObject({ worldNumber: 1, landing: 'cooperative' });
    expect(theory.landings[0]?.averageTotalTenths).toBe(1149);
    expect(theory.landings[0]?.note).toContain('about as little as a perfect agreement');
  });

  it('calls a world that competed all game competitive', () => {
    const hard = makeSession({ plays: [[competing, competing]] });
    expect(debriefFor(hard).theory.landings[0]?.landing).toBe('competitive');
    expect(debriefFor(hard).titles.gameTheory).toContain('full competition');
  });

  it('calls a world beyond full competition what it is', () => {
    const flat: Triple = [CAPACITY, CAPACITY, CAPACITY];
    const hardest = makeSession({ plays: [[flat, flat]] });
    expect(debriefFor(hardest).theory.landings[0]?.landing).toBe('beyond');
  });
});

describe('the ten questions', () => {
  it('asks all ten, each pointing at a screen', () => {
    const debrief = debriefFor(makeSession({ plays: [[cooperating]] }));
    expect(debrief.questions.map((question) => question.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    for (const question of debrief.questions) {
      expect(question.evidenceLabel.length).toBeGreaterThan(0);
      expect(question.text.endsWith('?')).toBe(true);
    }
  });

  it('fills in the cooperative share and the final year from the settings', () => {
    const debrief = debriefFor(makeSession({ plays: [[cooperating]] }));
    const seven = debrief.questions.find((question) => question.number === 7);
    expect(seven?.text).toContain('38.3');
    expect(seven?.evidence).toBe('gameTheory');

    const six = debrief.questions.find((question) => question.number === 6);
    expect(six?.text).toContain('Year 12');

    const five = debrief.questions.find((question) => question.number === 5);
    expect(five?.text).toContain('Year 9');
    expect(five?.text).toContain('15.0 million barrels');
  });

  it('asks a different question when the game had no new producer and no warning', () => {
    const settings = parseSettings({
      newProducer: { enabled: false },
      finalYearWarning: false,
    });
    const debrief = debriefFor(makeSession({ settings, plays: [[cooperating]] }));
    expect(debrief.questions.find((q) => q.number === 5)?.text).toContain('No new producer');
    expect(debrief.questions.find((q) => q.number === 6)?.text).toContain('never told');
  });

  it('uses the preset a class actually played', () => {
    const debrief = debriefFor(
      makeSession({ settings: PRESETS['short-50'], plays: [[cooperating]] }),
    );
    expect(debrief.questions.find((q) => q.number === 6)?.text).toContain('Year 8');
  });
});
