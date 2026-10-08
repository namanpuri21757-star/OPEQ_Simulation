import { describe, expect, it } from 'vitest';
import { defaultMembers, envoyNames, roleBlock, rolesForYear } from '../../src/shared/roles.js';

const FOUR = ['Ada', 'Ben', 'Cleo', 'Dev'];

describe('role blocks', () => {
  it('counts from Year 1 in steps of rotateEvery', () => {
    expect([1, 2, 3, 4].map((year) => roleBlock(year, 4))).toEqual([0, 0, 0, 0]);
    expect([5, 8, 9].map((year) => roleBlock(year, 4))).toEqual([1, 1, 2]);
  });

  it('puts the practice year in the same block as Year 1', () => {
    expect(roleBlock(0, 4)).toBe(roleBlock(1, 4));
  });
});

describe('handing out the two roles', () => {
  it('gives one job each with two members', () => {
    expect(rolesForYear(['Ada', 'Ben'], 1, 4)).toMatchObject({
      operator: 'Ada',
      envoys: ['Ben'],
    });
  });

  it('makes everyone after the Operator an Envoy with three members', () => {
    expect(rolesForYear(['Ada', 'Ben', 'Cleo'], 1, 4)).toMatchObject({
      operator: 'Ada',
      envoys: ['Ben', 'Cleo'],
    });
  });

  it('shares the Envoy job with four members', () => {
    expect(rolesForYear(FOUR, 1, 4)).toMatchObject({
      operator: 'Ada',
      envoys: ['Ben', 'Cleo', 'Dev'],
    });
  });

  it('gives one person both jobs on their own', () => {
    expect(rolesForYear(['Ada'], 7, 4)).toMatchObject({
      operator: 'Ada',
      envoys: ['Ada'],
    });
  });

  it('rotates the keyboard when the block changes', () => {
    const first = rolesForYear(['Ada', 'Ben', 'Cleo'], 1, 4).operator;
    const second = rolesForYear(['Ada', 'Ben', 'Cleo'], 5, 4).operator;
    const third = rolesForYear(['Ada', 'Ben', 'Cleo'], 9, 4).operator;
    expect([first, second, third]).toEqual(['Ada', 'Ben', 'Cleo']);
  });

  it('comes back round, so everyone has a turn', () => {
    const operators = [1, 5, 9, 13].map(
      (year) => rolesForYear(['Ada', 'Ben', 'Cleo'], year, 4).operator,
    );
    expect(operators).toEqual(['Ada', 'Ben', 'Cleo', 'Ada']);
  });

  it('falls back to numbered members when a group typed no names', () => {
    expect(defaultMembers(3)).toEqual(['Member 1', 'Member 2', 'Member 3']);
    expect(rolesForYear([], 1, 4).operator).toBe('Member 1');
  });
});

describe('naming the Envoys for one line of text', () => {
  it('reads as one name, two names or a list', () => {
    expect(envoyNames(rolesForYear(['Ada', 'Ben'], 1, 4))).toBe('Ben');
    expect(envoyNames(rolesForYear(['Ada', 'Ben', 'Cleo'], 1, 4))).toBe('Ben and Cleo');
    expect(envoyNames(rolesForYear(FOUR, 1, 4))).toBe('Ben, Cleo and Dev');
  });

  it('names the one person when they hold both jobs', () => {
    expect(envoyNames(rolesForYear(['Ada'], 1, 4))).toBe('Ada');
  });
});
